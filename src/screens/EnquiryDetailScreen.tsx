import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IoArrowBack,
  IoCall,
  IoCalendarOutline,
  IoDocumentTextOutline,
  IoHomeOutline,
  IoMailOutline,
  IoNewspaperOutline,
  IoPerson,
  IoPhonePortraitOutline,
  IoReaderOutline,
  IoShareSocialOutline,
  IoAdd,
} from 'react-icons/io5';
import { Timestamp, collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useEnquiriesContext } from '../context/EnquiriesContext';
import type { Enquiry, EnquiryFollowUp } from '../types';
import { getEnquiryStatusMeta } from '../utils/enquiryStatus';
import type { EnquiryStatusChipColor } from '../utils/enquiryStatus';
import {
  appointmentStats,
  buildPaymentEntries,
  formatCreatedAt,
  formatCurrency,
  formatFollowUpDateCell,
  getApptStatus,
  getCenterName,
  getPaymentSummary,
  getVisitAmount,
  getVisitDateLabel,
  getVisitServices,
  getVisits,
  hasValue,
} from '../utils/enquiryProfileHelpers';
import styles from './EnquiryDetailScreen.module.css';

function asRecord(e: Enquiry): Record<string, unknown> {
  return e as unknown as Record<string, unknown>;
}

function refList(ref: Enquiry['reference']): string[] {
  if (Array.isArray(ref)) return ref.filter(Boolean).map(String);
  if (ref) return [String(ref)];
  return [];
}

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

function pickCaller(options: string[], enquiry: Enquiry | undefined, me: string): string {
  if (me && options.includes(me)) return me;
  const t = enquiry?.telecaller?.trim();
  if (t && options.includes(t)) return t;
  const a = enquiry?.assignedTo?.trim();
  if (a && options.includes(a)) return a;
  return options[0] || me || '';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `fu-${Date.now()}`;
}

function journeyToneClass(color: EnquiryStatusChipColor): string {
  const map: Record<EnquiryStatusChipColor, string> = {
    default: styles.toneDefault,
    primary: styles.tonePrimary,
    secondary: styles.toneSecondary,
    error: styles.toneError,
    info: styles.toneInfo,
    success: styles.toneSuccess,
    warning: styles.toneWarning,
  };
  return map[color] || styles.toneDefault;
}

function serviceToneClass(color: EnquiryStatusChipColor): string {
  return journeyToneClass(color);
}

export default function EnquiryDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enquiries, loading, appendFollowUp, staffNames, myStaffDisplayName } = useEnquiriesContext();

  const enquiry = useMemo(() => enquiries.find((e) => e.id === id), [enquiries, id]);
  const raw = enquiry ? asRecord(enquiry) : null;

  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]);
  const [appointments, setAppointments] = useState<Record<string, unknown>[]>([]);
  const [activeVisitTab, setActiveVisitTab] = useState(0);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDocs(query(collection(db, 'centers'), orderBy('name')))
      .then((snap) => {
        if (cancelled) return;
        setCenters(
          snap.docs.map((d) => ({
            id: d.id,
            name: (d.data() as { name?: string }).name || d.id,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setCenters([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getDocs(query(collection(db, 'appointments'), where('enquiryId', '==', id)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];
        list.sort((a, b) => new Date(b.start as string).getTime() - new Date(a.start as string).getTime());
        setAppointments(list);
      })
      .catch(() => {
        if (!cancelled) setAppointments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const visits = useMemo(() => (raw ? getVisits(raw) : []), [raw]);
  const journeyStatus = useMemo(() => getEnquiryStatusMeta(raw), [raw]);
  const paySummary = useMemo(
    () => (raw ? getPaymentSummary(raw, visits) : { pendingAmount: 0, paymentStatus: 'pending' as const }),
    [raw, visits]
  );
  const apptStats = useMemo(() => appointmentStats(appointments), [appointments]);
  const paymentEntries = useMemo(() => (raw ? buildPaymentEntries(raw) : []), [raw]);
  const followUpsList = useMemo(
    () => (Array.isArray(enquiry?.followUps) ? [...enquiry.followUps] : []),
    [enquiry?.followUps]
  );
  const sortedFollowUps = useMemo(() => {
    const list = [...followUpsList];
    list.sort((a, b) => followSortMs(b) - followSortMs(a));
    return list;
  }, [followUpsList]);

  useEffect(() => {
    if (activeVisitTab >= visits.length) setActiveVisitTab(0);
  }, [activeVisitTab, visits.length]);

  const callerOptions = useMemo(() => {
    const set = new Set<string>();
    staffNames.forEach((n) => {
      if (n.trim()) set.add(n.trim());
    });
    if (enquiry?.telecaller?.trim()) set.add(enquiry.telecaller.trim());
    if (enquiry?.assignedTo?.trim()) set.add(enquiry.assignedTo.trim());
    if (myStaffDisplayName.trim()) set.add(myStaffDisplayName.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [staffNames, enquiry, myStaffDisplayName]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [callDate, setCallDate] = useState('');
  const [nextFu, setNextFu] = useState('');
  const [remarks, setRemarks] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerFreeText, setCallerFreeText] = useState('');

  useEffect(() => {
    if (!modalOpen || !enquiry) return;
    const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setCallDate(new Date().toISOString().split('T')[0]);
    setNextFu(week);
    setRemarks('');
    setFormErr(null);
    const opts = callerOptions;
    if (opts.length > 0) {
      setCallerName(pickCaller(opts, enquiry, myStaffDisplayName));
      setCallerFreeText('');
    } else {
      setCallerName('');
      setCallerFreeText(myStaffDisplayName || enquiry.telecaller || '');
    }
  }, [modalOpen, enquiry, callerOptions, myStaffDisplayName]);

  const handleSaveCall = async () => {
    if (!enquiry?.id) return;
    const caller = callerOptions.length > 0 ? callerName.trim() : callerFreeText.trim();
    if (!caller) {
      setFormErr('Enter who made the call.');
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const entry: EnquiryFollowUp = {
        id: newId(),
        date: callDate,
        remarks: remarks.trim(),
        nextFollowUpDate: nextFu,
        callerName: caller,
        createdAt: Timestamp.now(),
      };
      await appendFollowUp(enquiry.id, entry);
      setModalOpen(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const shareProfile = () => {
    if (!enquiry?.id) return;
    const base = (import.meta.env.VITE_CRM_URL || '').replace(/\/$/, '');
    const url = base ? `${base}/interaction/enquiries/${enquiry.id}` : '';
    const done = (msg: string) => {
      setShareToast(msg);
      window.setTimeout(() => setShareToast(null), 3200);
    };
    if (url && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(
        () => done('CRM profile link copied'),
        () => done('Could not copy — open CRM and search this patient')
      );
    } else if (url) {
      done(url);
    } else {
      done('Set VITE_CRM_URL to copy a profile link');
    }
  };

  if (!id) {
    navigate('/app/enquiries', { replace: true });
    return null;
  }

  if (!loading && !enquiry) {
    return (
      <div className={styles.page}>
        <header className={styles.toolbar}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <IoArrowBack size={22} />
            Back
          </button>
        </header>
        <div className={styles.scroll}>
          <p className={styles.muted}>Enquiry not found.</p>
        </div>
      </div>
    );
  }

  if (!enquiry || !raw) {
    return (
      <div className={styles.page}>
        <header className={styles.toolbar}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <IoArrowBack size={22} />
            Back
          </button>
        </header>
        <div className={styles.scroll}>
          <p className={styles.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  const phoneDigits = enquiry.phone?.replace(/\D/g, '') || '';
  const activeVisit = visits[activeVisitTab] as Record<string, unknown> | undefined;
  const paymentLabel =
    paySummary.paymentStatus === 'fully_paid' ? 'Paid' : paySummary.paymentStatus === 'partial' ? 'Partial' : 'Pending';
  const hasSubjectOrMessage = hasValue(enquiry.subject) || hasValue(enquiry.message);
  const refs = refList(enquiry.reference);

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
          <IoArrowBack size={22} />
          Back
        </button>
        <button type="button" className={styles.shareBtn} onClick={shareProfile}>
          <IoShareSocialOutline size={18} />
          Share profile
        </button>
      </header>

      <div className={styles.scroll}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden />
          <div className={styles.heroInner}>
            <div className={styles.avatar}>
              <IoPerson size={36} aria-hidden />
            </div>
            <div className={styles.heroMain}>
              <p className={styles.sectionEyebrow}>Patient profile</p>
              <h1 className={styles.patientName}>{enquiry.name || 'Patient name'}</h1>
              <p className={styles.heroLead}>
                Same journey view as the CRM — visits, appointments, calls, and payments. Edit records in the main CRM.
              </p>
              <div className={styles.chipRow}>
                {enquiry.phone ? (
                  <a className={styles.chipLink} href={phoneDigits ? `tel:${phoneDigits}` : undefined}>
                    <IoCall size={16} />
                    {enquiry.phone}
                  </a>
                ) : null}
                {enquiry.email ? (
                  <a className={styles.chipLink} href={`mailto:${encodeURIComponent(enquiry.email)}`}>
                    <IoMailOutline size={16} />
                    {enquiry.email}
                  </a>
                ) : null}
                <span className={`${styles.journeyChip} ${journeyToneClass(journeyStatus.color)}`} title={journeyStatus.source === 'manual' ? 'Manual status from CRM' : 'Derived from latest visit'}>
                  {journeyStatus.label}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.callPrimary}
              disabled={!phoneDigits}
              onClick={() => {
                if (phoneDigits) window.open(`tel:${phoneDigits}`, '_self');
              }}
            >
              <IoCall size={22} />
              Call lead
            </button>
            <button type="button" className={styles.logOutline} onClick={() => setModalOpen(true)}>
              Log call
            </button>
          </div>

          <div className={styles.metrics}>
            <div className={`${styles.metric} ${styles.metricCreated}`}>
              <span className={styles.metricLabel}>Created</span>
              <span className={styles.metricValue}>{formatCreatedAt(raw)}</span>
            </div>
            <div className={`${styles.metric} ${styles.metricVisits}`}>
              <span className={styles.metricLabel}>Visits</span>
              <span className={styles.metricValue}>{String(visits.length)}</span>
            </div>
            <div className={`${styles.metric} ${styles.metricCalls}`}>
              <span className={styles.metricLabel}>Calls</span>
              <span className={styles.metricValue}>{String(followUpsList.length)}</span>
            </div>
            <div
              className={`${styles.metric} ${paySummary.pendingAmount > 0 ? styles.metricPendingDue : styles.metricPendingOk}`}
            >
              <span className={styles.metricLabel}>Pending</span>
              <span className={styles.metricValue}>{formatCurrency(paySummary.pendingAmount) || '₹0'}</span>
            </div>
            <div
              className={`${styles.metric} ${
                paySummary.paymentStatus === 'fully_paid'
                  ? styles.metricPayOk
                  : paySummary.paymentStatus === 'partial'
                    ? styles.metricPayPartial
                    : styles.metricPayDue
              }`}
            >
              <span className={styles.metricLabel}>Payment</span>
              <span className={styles.metricValue}>{paymentLabel}</span>
            </div>
          </div>
        </section>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon} aria-hidden>
              <IoPerson size={20} />
            </span>
            <div>
              <h2 className={styles.cardTitle}>Patient information</h2>
              <p className={styles.cardSub}>Core details from the enquiry</p>
            </div>
          </div>
          <div className={styles.infoBody}>
            {hasValue(enquiry.address) ? (
              <div className={styles.infoRow}>
                <span className={styles.infoIcon}>
                  <IoHomeOutline size={18} />
                </span>
                <div>
                  <p className={styles.infoLabel}>Address</p>
                  <p className={styles.infoValue}>{String(enquiry.address)}</p>
                </div>
              </div>
            ) : null}
            {refs.length > 0 ? (
              <div className={styles.infoRow}>
                <span className={styles.infoIcon}>
                  <IoPhonePortraitOutline size={18} />
                </span>
                <div>
                  <p className={styles.infoLabel}>Reference source</p>
                  <div className={styles.refChips}>
                    {refs.map((r) => (
                      <span key={r} className={styles.refChip}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {enquiry.assignedTo ? (
              <div className={styles.infoRow}>
                <span className={styles.infoIcon}>
                  <IoPerson size={18} />
                </span>
                <div>
                  <p className={styles.infoLabel}>Assigned to</p>
                  <p className={styles.infoValue}>{enquiry.assignedTo}</p>
                </div>
              </div>
            ) : null}
            {enquiry.telecaller ? (
              <div className={styles.infoRow}>
                <span className={styles.infoIcon}>
                  <IoCall size={18} />
                </span>
                <div>
                  <p className={styles.infoLabel}>Telecaller</p>
                  <p className={styles.infoValue}>{enquiry.telecaller}</p>
                </div>
              </div>
            ) : null}
            {enquiry.center ? (
              <div className={styles.infoRow}>
                <span className={styles.infoIcon}>
                  <IoHomeOutline size={18} />
                </span>
                <div>
                  <p className={styles.infoLabel}>Center</p>
                  <p className={styles.infoValue}>
                    {centers.find((c) => c.id === enquiry.center)?.name || enquiry.center}
                  </p>
                </div>
              </div>
            ) : null}
            {!enquiry.address && refs.length === 0 && !enquiry.assignedTo && !enquiry.telecaller && !enquiry.center ? (
              <p className={styles.muted}>No extra patient fields yet.</p>
            ) : null}
          </div>
        </article>

        {hasSubjectOrMessage ? (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon} aria-hidden>
                <IoDocumentTextOutline size={20} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Enquiry details</h2>
                <p className={styles.cardSub}>Concern and context</p>
              </div>
            </div>
            <div className={styles.infoBody}>
              {hasValue(enquiry.subject) ? (
                <div className={styles.infoRow}>
                  <span className={styles.infoIcon}>
                    <IoNewspaperOutline size={18} />
                  </span>
                  <div>
                    <p className={styles.infoLabel}>Subject</p>
                    <p className={styles.infoValue}>{enquiry.subject}</p>
                  </div>
                </div>
              ) : null}
              {hasValue(enquiry.message) ? (
                <div className={styles.messageBox}>
                  <p className={styles.messageBoxLabel}>Message / notes</p>
                  <p className={styles.messageBoxText}>{enquiry.message}</p>
                </div>
              ) : null}
            </div>
          </article>
        ) : null}

        {visits.length > 0 ? (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon} aria-hidden>
                <IoReaderOutline size={20} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Visit history</h2>
                <p className={styles.cardSub}>Open each visit for summary</p>
              </div>
            </div>
            <div className={styles.visitTabs} role="tablist" aria-label="Visits">
              {visits.map((v, index) => (
                <button
                  key={(v as { id?: string }).id ?? index}
                  type="button"
                  role="tab"
                  aria-selected={activeVisitTab === index}
                  className={`${styles.visitTab} ${activeVisitTab === index ? styles.visitTabActive : ''}`}
                  onClick={() => setActiveVisitTab(index)}
                >
                  <span className={styles.visitTabTitle}>Visit {index + 1}</span>
                  <span className={styles.visitTabMeta}>{getVisitDateLabel(v as Record<string, unknown>)}</span>
                </button>
              ))}
            </div>
            {activeVisit ? (
              <div className={styles.visitPanel}>
                <div className={styles.serviceRow}>
                  {getVisitServices(activeVisit).map((s) => (
                    <span key={s.label} className={`${styles.serviceChip} ${serviceToneClass(s.color)}`}>
                      {s.label}
                    </span>
                  ))}
                  {getVisitServices(activeVisit).length === 0 ? (
                    <span className={styles.serviceChipMuted}>Visit recorded</span>
                  ) : null}
                </div>
                <div className={styles.visitGrid}>
                  <div>
                    <p className={styles.kvLabel}>Visit date</p>
                    <p className={styles.kvValue}>{getVisitDateLabel(activeVisit)}</p>
                  </div>
                  <div>
                    <p className={styles.kvLabel}>Visit time</p>
                    <p className={styles.kvValue}>{hasValue(activeVisit.visitTime) ? String(activeVisit.visitTime) : '—'}</p>
                  </div>
                  <div>
                    <p className={styles.kvLabel}>Visit type</p>
                    <p className={styles.kvValue}>
                      {activeVisit.visitType === 'center'
                        ? 'Center visit'
                        : activeVisit.visitType === 'home'
                          ? 'Home visit'
                          : '—'}
                    </p>
                  </div>
                  <div>
                    <p className={styles.kvLabel}>Center</p>
                    <p className={styles.kvValue}>{getCenterName(activeVisit, raw, centers) || '—'}</p>
                  </div>
                </div>
                <div className={styles.visitAmountBanner}>
                  <span className={styles.visitAmountLabel}>Visit amount</span>
                  <span className={styles.visitAmountFig}>{formatCurrency(getVisitAmount(activeVisit)) || '—'}</span>
                </div>
                {(activeVisit.hearingTest || hasValue(activeVisit.testType) || hasValue(activeVisit.testResults)) ? (
                  <div className={styles.subSection}>
                    <p className={styles.subSectionTitle}>Hearing test</p>
                    <div className={styles.visitGrid}>
                      {hasValue(activeVisit.testType) ? (
                        <div>
                          <p className={styles.kvLabel}>Test type</p>
                          <p className={styles.kvValue}>{String(activeVisit.testType)}</p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.testDoneBy) ? (
                        <div>
                          <p className={styles.kvLabel}>Done by</p>
                          <p className={styles.kvValue}>{String(activeVisit.testDoneBy)}</p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.testPrice) ? (
                        <div>
                          <p className={styles.kvLabel}>Price</p>
                          <p className={styles.kvValue}>{formatCurrency(Number(activeVisit.testPrice))}</p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.testResults) ? (
                        <div className={styles.fullWidth}>
                          <p className={styles.kvLabel}>Results</p>
                          <p className={styles.kvValue}>{String(activeVisit.testResults)}</p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.recommendations) ? (
                        <div className={styles.fullWidth}>
                          <p className={styles.kvLabel}>Recommendations</p>
                          <p className={styles.kvValue}>{String(activeVisit.recommendations)}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {(activeVisit.trialGiven ||
                  activeVisit.hearingAidTrial ||
                  hasValue(activeVisit.trialHearingAidBrand) ||
                  hasValue(activeVisit.trialStartDate)) ? (
                  <div className={styles.subSection}>
                    <p className={styles.subSectionTitle}>Trial</p>
                    <div className={styles.visitGrid}>
                      {hasValue(activeVisit.trialHearingAidBrand || activeVisit.hearingAidBrand) ? (
                        <div>
                          <p className={styles.kvLabel}>Brand</p>
                          <p className={styles.kvValue}>
                            {String(activeVisit.trialHearingAidBrand || activeVisit.hearingAidBrand)}
                          </p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.trialHearingAidModel || activeVisit.hearingAidModel) ? (
                        <div>
                          <p className={styles.kvLabel}>Model</p>
                          <p className={styles.kvValue}>
                            {String(activeVisit.trialHearingAidModel || activeVisit.hearingAidModel)}
                          </p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.trialStartDate) ? (
                        <div>
                          <p className={styles.kvLabel}>Start</p>
                          <p className={styles.kvValue}>{String(activeVisit.trialStartDate)}</p>
                        </div>
                      ) : null}
                      {hasValue(activeVisit.trialEndDate) ? (
                        <div>
                          <p className={styles.kvLabel}>End</p>
                          <p className={styles.kvValue}>{String(activeVisit.trialEndDate)}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {(hasValue(activeVisit.visitNotes) || hasValue(activeVisit.notes)) ? (
                  <div className={styles.subSection}>
                    <p className={styles.subSectionTitle}>Visit notes</p>
                    {hasValue(activeVisit.visitNotes) ? (
                      <p className={styles.kvValueBlock}>{String(activeVisit.visitNotes)}</p>
                    ) : null}
                    {hasValue(activeVisit.notes) ? (
                      <p className={styles.kvValueBlock}>{String(activeVisit.notes)}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon} aria-hidden>
              <IoCalendarOutline size={20} />
            </span>
            <div style={{ flex: 1 }}>
              <h2 className={styles.cardTitle}>Appointments</h2>
              <p className={styles.cardSub}>
                {apptStats.total} total · {apptStats.completed} completed · {apptStats.cancelled} cancelled ·{' '}
                {apptStats.upcoming} upcoming
              </p>
            </div>
          </div>
          {apptStats.pastScheduled > 0 ? (
            <p className={styles.warnBanner}>
              {apptStats.pastScheduled} past slot(s) still marked scheduled — update in the scheduler.
            </p>
          ) : null}
          {appointments.length === 0 ? (
            <p className={styles.muted}>No appointments linked yet. Schedule from the telecalling PWA calendar.</p>
          ) : (
            <ul className={styles.apptList}>
              {appointments.map((appt) => {
                const st = getApptStatus(appt);
                const start = appt.start ? new Date(appt.start as string) : null;
                const when =
                  start && !Number.isNaN(start.getTime())
                    ? `${start.toLocaleDateString('en-IN')} · ${start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    : '—';
                return (
                  <li key={String(appt.id)} className={styles.apptRow}>
                    <div>
                      <p className={styles.apptWhen}>{when}</p>
                      <p className={styles.apptMeta}>{appt.type === 'home' ? 'Home' : 'Center'}</p>
                    </div>
                    <span
                      className={`${styles.apptStatus} ${
                        st === 'cancelled' ? styles.apptCancelled : st === 'completed' ? styles.apptDone : styles.apptSched
                      }`}
                    >
                      {st === 'cancelled' ? 'Cancelled' : st === 'completed' ? 'Completed' : 'Scheduled'}
                    </span>
                    <p className={styles.apptNotes} title={String(appt.notes || '')}>
                      {String(appt.notes || '—')}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        {paymentEntries.length > 0 ? (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon} aria-hidden>
                <IoDocumentTextOutline size={20} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Recent payments</h2>
                <p className={styles.cardSub}>Recorded on this enquiry</p>
              </div>
            </div>
            <ul className={styles.payList}>
              {paymentEntries.slice(0, 8).map((p, i) => (
                <li key={`${p.label}-${i}`} className={styles.payRow}>
                  <span className={styles.payLabel}>{p.label}</span>
                  <span className={styles.payAmt}>{formatCurrency(p.amount)}</span>
                  {p.date ? <span className={styles.payDate}>{p.date}</span> : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon} aria-hidden>
              <IoCall size={20} />
            </span>
            <div style={{ flex: 1 }}>
              <h2 className={styles.cardTitle}>Call history</h2>
              <p className={styles.cardSub}>
                {followUpsList.length} follow-up {followUpsList.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
            <button type="button" className={styles.logCompact} onClick={() => setModalOpen(true)}>
              <IoAdd size={18} />
              Log call
            </button>
          </div>
          {sortedFollowUps.length === 0 ? (
            <p className={styles.muted}>No calls logged yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Remarks</th>
                    <th>Next</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFollowUps.map((f, index) => (
                    <tr key={f.id || index}>
                      <td>{formatFollowUpDateCell(f.date)}</td>
                      <td>{f.remarks ?? '—'}</td>
                      <td>{formatFollowUpDateCell(f.nextFollowUpDate)}</td>
                      <td>{f.callerName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <div className={styles.bottomPad} />
      </div>

      {shareToast ? (
        <div className={styles.toast} role="status">
          {shareToast}
        </div>
      ) : null}

      {modalOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="log-call-title">
          <div className={styles.modal}>
            <h2 id="log-call-title" className={styles.modalTitle}>
              Log telecalling
            </h2>
            <p className={styles.modalSub}>Matches CRM enquiry follow-up fields.</p>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Call date</span>
              <input
                type="date"
                className={styles.input}
                value={callDate}
                onChange={(e) => setCallDate(e.target.value)}
                disabled={saving}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Next follow-up</span>
              <input
                type="date"
                className={styles.input}
                value={nextFu}
                onChange={(e) => setNextFu(e.target.value)}
                disabled={saving}
              />
            </label>

            {callerOptions.length > 0 ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Caller</span>
                <select
                  className={styles.select}
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  disabled={saving}
                >
                  {callerOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Caller name</span>
                <input
                  className={styles.input}
                  value={callerFreeText}
                  onChange={(e) => setCallerFreeText(e.target.value)}
                  placeholder="Your name"
                  disabled={saving}
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Remarks</span>
              <textarea
                className={styles.textarea}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Outcome, notes…"
                disabled={saving}
              />
            </label>

            {formErr ? <p className={styles.formErr}>{formErr}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.modalSubmit} onClick={() => void handleSaveCall()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
