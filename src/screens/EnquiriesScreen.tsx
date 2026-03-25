import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { IoChevronForward, IoSearchOutline } from 'react-icons/io5';
import type { AppShellOutletContext } from '../components/AppShell';
import { useEnquiriesContext } from '../context/EnquiriesContext';
import type { Enquiry } from '../types';
import styles from './EnquiriesScreen.module.css';

function refText(ref: Enquiry['reference']): string {
  if (Array.isArray(ref)) return ref.filter(Boolean).join(', ');
  return ref || '';
}

export default function EnquiriesScreen() {
  const { onLogout } = useOutletContext<AppShellOutletContext>();
  const navigate = useNavigate();
  const { enquiries, loading, error } = useEnquiriesContext();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return enquiries;
    return enquiries.filter((e) => {
      const hay = [
        e.name,
        e.phone,
        e.email,
        e.assignedTo,
        e.telecaller,
        e.center,
        refText(e.reference),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(s);
    });
  }, [enquiries, q]);

  return (
    <div className={styles.container}>
      <header className={styles.headerBar}>
        <div className={styles.header}>
          <div>
            <p className={styles.greeting}>View only</p>
            <h1 className={styles.title}>Enquiries</h1>
          </div>
          <button type="button" className={styles.logoutBtn} onClick={onLogout}>
            Logout
          </button>
        </div>
        <div className={styles.searchWrap}>
          <IoSearchOutline className={styles.searchIcon} size={20} aria-hidden />
          <input
            className={styles.search}
            placeholder="Search name, phone, center…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search enquiries"
          />
        </div>
      </header>

      {error ? (
        <div className={styles.centered}>
          <p className={styles.errorTitle}>Could not load enquiries</p>
          <p className={styles.errorText}>{error}</p>
        </div>
      ) : loading && enquiries.length === 0 ? (
        <div className={styles.centered}>
          <div className={styles.spinner} />
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No enquiries</p>
          <p className={styles.emptyText}>
            {q.trim() ? 'Try a different search.' : 'Nothing to show yet.'}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {filtered.map((e) => {
            const calls = Array.isArray(e.followUps) ? e.followUps.length : 0;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={styles.card}
                  onClick={() => navigate(`/app/enquiries/${encodeURIComponent(e.id)}`)}
                >
                  <div className={styles.cardMain}>
                    <span className={styles.name}>{e.name || 'Unnamed'}</span>
                    <span className={styles.phone}>{e.phone || '—'}</span>
                    {e.center ? <span className={styles.meta}>{e.center}</span> : null}
                    {e.telecaller ? (
                      <span className={styles.meta}>Telecaller: {e.telecaller}</span>
                    ) : null}
                  </div>
                  <div className={styles.cardRight}>
                    {calls > 0 ? <span className={styles.badge}>{calls} calls</span> : null}
                    <IoChevronForward size={20} className={styles.chev} aria-hidden />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
