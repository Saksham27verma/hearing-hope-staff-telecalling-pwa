import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { collection, getDocs, onSnapshot, updateDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Enquiry, EnquiryFollowUp } from '../types';

interface EnquiriesContextValue {
  enquiries: Enquiry[];
  staffNames: string[];
  myStaffDisplayName: string;
  loading: boolean;
  error: string | null;
  appendFollowUp: (enquiryId: string, entry: EnquiryFollowUp) => Promise<void>;
}

const EnquiriesContext = createContext<EnquiriesContextValue | null>(null);

function mapEnquiryDoc(id: string, data: Record<string, unknown>): Enquiry {
  return {
    id,
    ...(data as Omit<Enquiry, 'id'>),
  };
}

function createdAtMillis(v: unknown): number {
  if (!v || typeof v !== 'object') return 0;
  const o = v as { toDate?: () => Date; seconds?: number };
  if (typeof o.toDate === 'function') return o.toDate().getTime();
  if (typeof o.seconds === 'number') return o.seconds * 1000;
  return 0;
}

export function EnquiriesProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [myStaffDisplayName, setMyStaffDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDoc(doc(db, 'staff', userId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as { name?: string; displayName?: string };
        const n = (d.name || d.displayName || '').trim();
        if (n) setMyStaffDisplayName(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void getDocs(collection(db, 'staff'))
      .then((snap) => {
        if (cancelled) return;
        const names = snap.docs
          .map((d) => {
            const n = (d.data() as { name?: string }).name;
            return typeof n === 'string' ? n.trim() : '';
          })
          .filter(Boolean);
        setStaffNames([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {
        if (!cancelled) setStaffNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsub = onSnapshot(
      collection(db, 'enquiries'),
      (snapshot) => {
        if (!mounted) return;
        const list = snapshot.docs.map((d) => mapEnquiryDoc(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
        setEnquiries(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (!mounted) return;
        setError(err.message);
        setLoading(false);
      }
    );
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const appendFollowUp = useCallback(async (enquiryId: string, entry: EnquiryFollowUp) => {
    const ref = doc(db, 'enquiries', enquiryId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Enquiry not found');
    const data = snap.data() as Enquiry;
    const prev = Array.isArray(data.followUps) ? data.followUps : [];
    const next = [...prev, { ...entry, createdAt: entry.createdAt ?? Timestamp.now() }];
    await updateDoc(ref, { followUps: next });
  }, []);

  const value = useMemo(
    () => ({
      enquiries,
      staffNames,
      myStaffDisplayName,
      loading,
      error,
      appendFollowUp,
    }),
    [enquiries, staffNames, myStaffDisplayName, loading, error, appendFollowUp]
  );

  return <EnquiriesContext.Provider value={value}>{children}</EnquiriesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook + provider pattern
export function useEnquiriesContext() {
  const ctx = useContext(EnquiriesContext);
  if (!ctx) throw new Error('useEnquiriesContext must be used within EnquiriesProvider');
  return ctx;
}
