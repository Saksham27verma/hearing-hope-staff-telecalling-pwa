import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { IoChevronForward, IoSearchOutline, IoOptionsOutline } from 'react-icons/io5';
import { endOfDay, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import type { AppShellOutletContext } from '../components/AppShell';
import { useEnquiriesContext } from '../context/EnquiriesContext';
import type { Enquiry, EnquiryFollowUp } from '../types';
import styles from './TelecallingScreen.module.css';

type Row = {
  enquiryId: string;
  enquiryName: string;
  enquiryPhone?: string;
  enquiryEmail?: string;
  enquirySubject?: string;
  assignedTo?: string;
  followUp: EnquiryFollowUp;
  /** Call / follow-up date string (followUp.date) */
  followUpDate: string;
  /** Next follow-up date string */
  nextFollowUpDate: string;
  telecaller: string;
};

const QUICK_FILTERS: { label: string; value: string }[] = [
  { label: 'All calls', value: '' },
  { label: "Today's calls", value: 'today_calls' },
  { label: "Yesterday's calls", value: 'yesterday_calls' },
  { label: 'Last week', value: 'last_week_calls' },
  { label: 'Last month', value: 'last_month_calls' },
  { label: 'All due', value: 'all_due_calls' },
  { label: 'Due today', value: 'due_today' },
  { label: 'Due tomorrow', value: 'due_tomorrow' },
  { label: 'Due this week', value: 'due_this_week' },
];

function followSortMs(f: EnquiryFollowUp): number {
  const c = f.createdAt;
  if (c && typeof c === 'object') {
    const o = c as { toDate?: () => Date; seconds?: number };
    if (typeof o.toDate === 'function') return o.toDate().getTime();
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  if (f.date) {
    const d = new Date(f.date);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function formatWhen(f: EnquiryFollowUp): string {
  const c = f.createdAt;
  if (c && typeof c === 'object') {
    const o = c as { toDate?: () => Date };
    if (typeof o.toDate === 'function') return o.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (f.date) {
    const d = new Date(f.date);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
  }
  return '—';
}

function parseRecordDate(s: string | undefined): Date | null {
  if (!s || !String(s).trim()) return null;
  try {
    const d = parseISO(String(s).trim());
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

type DateRange = {
  from: Date;
  to: Date;
  type: 'followUp' | 'nextFollowUp';
};

/** Mirrors CRM `telecalling-records/page.tsx` getDateRange */
function getDateRange(filterType: string): DateRange | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  const lastMonth = new Date(today);
  lastMonth.setMonth(today.getMonth() - 1);

  const thisWeekStart = new Date(today);
  const dayOfWeek = today.getDay();
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  thisWeekStart.setDate(diff);

  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

  switch (filterType) {
    case 'today_calls':
      return { from: today, to: today, type: 'followUp' };
    case 'yesterday_calls':
      return { from: yesterday, to: yesterday, type: 'followUp' };
    case 'last_week_calls':
      return { from: lastWeek, to: today, type: 'followUp' };
    case 'last_month_calls':
      return { from: lastMonth, to: today, type: 'followUp' };
    case 'due_today':
      return { from: today, to: today, type: 'nextFollowUp' };
    case 'due_tomorrow':
      return { from: tomorrow, to: tomorrow, type: 'nextFollowUp' };
    case 'due_this_week':
      return { from: thisWeekStart, to: thisWeekEnd, type: 'nextFollowUp' };
    case 'all_due_calls':
      return { from: new Date(2020, 0, 1), to: new Date(2030, 11, 31), type: 'nextFollowUp' };
    default:
      return null;
  }
}

function rowMatchesQuickFilter(row: Row, quickFilter: string): boolean {
  if (!quickFilter) return true;
  const range = getDateRange(quickFilter);
  if (!range) return true;

  const raw = range.type === 'followUp' ? row.followUpDate : row.nextFollowUpDate;
  const recordDate = parseRecordDate(raw);
  if (!recordDate) return false;

  const start = startOfDay(range.from);
  const end = endOfDay(range.to);
  return isWithinInterval(recordDate, { start, end });
}

function parseInputDateBoundary(s: string, end: boolean): Date | null {
  if (!s.trim()) return null;
  const d = new Date(s + (end ? 'T23:59:59.999' : 'T00:00:00'));
  return Number.isNaN(d.getTime()) ? null : end ? endOfDay(d) : startOfDay(d);
}

export default function TelecallingScreen() {
  const { onLogout } = useOutletContext<AppShellOutletContext>();
  const navigate = useNavigate();
  const { enquiries, loading, error } = useEnquiriesContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTelecaller, setSelectedTelecaller] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [followUpDateFrom, setFollowUpDateFrom] = useState('');
  const [followUpDateTo, setFollowUpDateTo] = useState('');
  const [nextFollowUpDateFrom, setNextFollowUpDateFrom] = useState('');
  const [nextFollowUpDateTo, setNextFollowUpDateTo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const e of enquiries) {
      const list = Array.isArray(e.followUps) ? e.followUps : [];
      const subject = (e as Enquiry & { subject?: string }).subject || e.message || '';
      for (const followUp of list) {
        out.push({
          enquiryId: e.id,
          enquiryName: e.name || 'Unnamed',
          enquiryPhone: e.phone,
          enquiryEmail: e.email,
          enquirySubject: subject || undefined,
          assignedTo: e.assignedTo,
          followUp,
          followUpDate: followUp.date || '',
          nextFollowUpDate: followUp.nextFollowUpDate || '',
          telecaller: followUp.callerName?.trim() || 'Unknown',
        });
      }
    }
    out.sort((a, b) => followSortMs(b.followUp) - followSortMs(a.followUp));
    return out;
  }, [enquiries]);

  const uniqueTelecallers = useMemo(() => {
    const set = new Set(rows.map((r) => r.telecaller).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    let filtered = rows;

    if (quickFilter) {
      filtered = filtered.filter((r) => rowMatchesQuickFilter(r, quickFilter));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.enquiryName.toLowerCase().includes(term) ||
          (r.enquiryPhone || '').toLowerCase().includes(term) ||
          r.telecaller.toLowerCase().includes(term) ||
          (r.followUp.remarks || '').toLowerCase().includes(term) ||
          (r.enquirySubject || '').toLowerCase().includes(term) ||
          (r.enquiryEmail || '').toLowerCase().includes(term) ||
          (r.assignedTo || '').toLowerCase().includes(term)
      );
    }

    if (selectedTelecaller) {
      filtered = filtered.filter((r) => r.telecaller === selectedTelecaller);
    }

    if (!quickFilter && (followUpDateFrom || followUpDateTo)) {
      filtered = filtered.filter((r) => {
        const recordDate = parseRecordDate(r.followUpDate);
        if (!recordDate) return false;
        const from = parseInputDateBoundary(followUpDateFrom, false);
        const to = parseInputDateBoundary(followUpDateTo, true);
        if (from && to) return isWithinInterval(recordDate, { start: from, end: to });
        if (from) return recordDate >= from;
        if (to) return recordDate <= to;
        return true;
      });
    }

    if (!quickFilter && (nextFollowUpDateFrom || nextFollowUpDateTo)) {
      filtered = filtered.filter((r) => {
        const recordDate = parseRecordDate(r.nextFollowUpDate);
        if (!recordDate) return false;
        const from = parseInputDateBoundary(nextFollowUpDateFrom, false);
        const to = parseInputDateBoundary(nextFollowUpDateTo, true);
        if (from && to) return isWithinInterval(recordDate, { start: from, end: to });
        if (from) return recordDate >= from;
        if (to) return recordDate <= to;
        return true;
      });
    }

    return filtered;
  }, [
    rows,
    quickFilter,
    searchTerm,
    selectedTelecaller,
    followUpDateFrom,
    followUpDateTo,
    nextFollowUpDateFrom,
    nextFollowUpDateTo,
  ]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTelecaller('');
    setQuickFilter('');
    setFollowUpDateFrom('');
    setFollowUpDateTo('');
    setNextFollowUpDateFrom('');
    setNextFollowUpDateTo('');
  };

  const hasActiveFilters =
    !!searchTerm.trim() ||
    !!selectedTelecaller ||
    !!quickFilter ||
    !!followUpDateFrom ||
    !!followUpDateTo ||
    !!nextFollowUpDateFrom ||
    !!nextFollowUpDateTo;

  const showEmpty = !loading && !error && rows.length === 0;
  const showNoMatch = !loading && !error && rows.length > 0 && filteredRows.length === 0;

  return (
    <div className={styles.container}>
      <header className={styles.headerBar}>
        <div className={styles.header}>
          <div>
            <p className={styles.greeting}>History</p>
            <h1 className={styles.title}>Telecalling</h1>
          </div>
          <button type="button" className={styles.logoutBtn} onClick={onLogout}>
            Logout
          </button>
        </div>

        {!error && (loading || rows.length > 0) ? (
          <div className={styles.filters}>
            <div className={styles.quickRow} role="tablist" aria-label="Quick filters">
              {QUICK_FILTERS.map((q) => (
                <button
                  key={q.value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={quickFilter === q.value}
                  className={`${styles.quickChip} ${quickFilter === q.value ? styles.quickChipActive : ''}`}
                  onClick={() => setQuickFilter(q.value)}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className={styles.searchWrap}>
              <IoSearchOutline className={styles.searchIcon} size={20} aria-hidden />
              <input
                className={styles.search}
                placeholder="Search name, phone, caller, remarks, email, subject…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search telecalling records"
              />
            </div>

            <label className={styles.selectLabel}>
              <span className={styles.selectCaption}>Caller (telecaller)</span>
              <select
                className={styles.select}
                value={selectedTelecaller}
                onChange={(e) => setSelectedTelecaller(e.target.value)}
                aria-label="Filter by telecaller"
              >
                <option value="">All callers</option>
                {uniqueTelecallers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={styles.moreToggle}
              onClick={() => setShowMoreFilters((v) => !v)}
              aria-expanded={showMoreFilters}
            >
              <IoOptionsOutline size={20} aria-hidden />
              {showMoreFilters ? 'Hide' : 'More'} filters (call / next date)
            </button>

            {showMoreFilters ? (
              <div className={styles.morePanel}>
                <p className={styles.moreHint}>
                  Date ranges apply only when no quick preset is selected (same as CRM).
                </p>
                <div className={styles.dateGrid}>
                  <label className={styles.dateField}>
                    <span>Call date from</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={followUpDateFrom}
                      onChange={(e) => setFollowUpDateFrom(e.target.value)}
                      disabled={!!quickFilter}
                    />
                  </label>
                  <label className={styles.dateField}>
                    <span>Call date to</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={followUpDateTo}
                      onChange={(e) => setFollowUpDateTo(e.target.value)}
                      disabled={!!quickFilter}
                    />
                  </label>
                  <label className={styles.dateField}>
                    <span>Next follow-up from</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={nextFollowUpDateFrom}
                      onChange={(e) => setNextFollowUpDateFrom(e.target.value)}
                      disabled={!!quickFilter}
                    />
                  </label>
                  <label className={styles.dateField}>
                    <span>Next follow-up to</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={nextFollowUpDateTo}
                      onChange={(e) => setNextFollowUpDateTo(e.target.value)}
                      disabled={!!quickFilter}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className={styles.filterMeta}>
              {rows.length > 0 ? (
                <span className={styles.count}>
                  Showing {filteredRows.length} of {rows.length}
                </span>
              ) : null}
              {hasActiveFilters ? (
                <button type="button" className={styles.clearBtn} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className={styles.centered}>
          <p className={styles.errorTitle}>Could not load data</p>
          <p className={styles.errorText}>{error}</p>
        </div>
      ) : loading && enquiries.length === 0 ? (
        <div className={styles.centered}>
          <div className={styles.spinner} />
        </div>
      ) : showEmpty ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No calls logged</p>
          <p className={styles.emptyText}>Open an enquiry and tap &quot;Log call&quot; to add a telecalling record.</p>
        </div>
      ) : showNoMatch ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No matching records</p>
          <p className={styles.emptyText}>Try changing filters or clear them to see all calls.</p>
          <button type="button" className={styles.clearBtnLarge} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {filteredRows.map((r) => {
            const f = r.followUp;
            const key = `${r.enquiryId}-${f.id}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={styles.card}
                  onClick={() => navigate(`/app/enquiries/${encodeURIComponent(r.enquiryId)}`)}
                >
                  <div className={styles.cardMain}>
                    <span className={styles.when}>{formatWhen(f)}</span>
                    <span className={styles.name}>{r.enquiryName}</span>
                    <span className={styles.caller}>{f.callerName || '—'}</span>
                    {f.remarks ? <p className={styles.remarks}>{f.remarks}</p> : null}
                    {r.enquiryPhone ? <span className={styles.phone}>{r.enquiryPhone}</span> : null}
                    {r.nextFollowUpDate ? (
                      <span className={styles.nextFu}>Next: {r.nextFollowUpDate}</span>
                    ) : null}
                  </div>
                  <IoChevronForward size={20} className={styles.chev} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
