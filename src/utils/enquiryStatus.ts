export type EnquiryJourneyStatus =
  | 'enquiry'
  | 'in_process'
  | 'in_trial'
  | 'booked'
  | 'sold'
  | 'not_interested'
  | 'completed';

export type EnquiryStatusChipColor =
  'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

export const ENQUIRY_STATUS_OPTIONS: Array<{ value: EnquiryJourneyStatus; label: string }> = [
  { value: 'enquiry', label: 'New Enquiry' },
  { value: 'in_process', label: 'In Process' },
  { value: 'in_trial', label: 'In Trial' },
  { value: 'booked', label: 'Booked' },
  { value: 'sold', label: 'Sold' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'completed', label: 'Completed' },
];

const VALID_OVERRIDE = new Set<string>(ENQUIRY_STATUS_OPTIONS.map((o) => o.value));

const normalize = (value: unknown) => String(value || '').toLowerCase();

const JOURNEY_META: Record<
  EnquiryJourneyStatus,
  { label: string; color: EnquiryStatusChipColor }
> = {
  enquiry: { label: 'New Enquiry', color: 'default' },
  in_process: { label: 'In Process', color: 'info' },
  in_trial: { label: 'In Trial', color: 'warning' },
  booked: { label: 'Booked', color: 'primary' },
  sold: { label: 'Sold', color: 'success' },
  not_interested: { label: 'Not Interested', color: 'error' },
  completed: { label: 'Completed', color: 'success' },
};

/** Firestore `journeyStatusOverride`: set to a journey key to pin the chip; null/omit for auto. */
export const parseJourneyStatusOverride = (raw: unknown): EnquiryJourneyStatus | null => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!VALID_OVERRIDE.has(s)) return null;
  return s as EnquiryJourneyStatus;
};

export const journeyKeyToMeta = (
  key: EnquiryJourneyStatus
): { key: EnquiryJourneyStatus; label: string; color: EnquiryStatusChipColor } => ({
  key,
  ...JOURNEY_META[key],
});

const getVisitSchedules = (enquiry: Record<string, unknown>): unknown[] => {
  const v = enquiry?.visitSchedules;
  if (Array.isArray(v) && v.length > 0) return v;
  const vis = enquiry?.visits;
  if (Array.isArray(vis) && vis.length > 0) return vis;
  return [];
};

const getVisitSortTime = (visit: Record<string, unknown>): number => {
  const candidates = [visit?.visitDate, visit?.date, visit?.bookingDate, visit?.trialStartDate];
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c as string).getTime();
    if (Number.isFinite(t)) return t;
  }
  const ca = visit?.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (ca && typeof ca.toMillis === 'function') return ca.toMillis();
  if (typeof ca?.seconds === 'number') return ca.seconds * 1000;
  return 0;
};

const isVisitCancelled = (visit: Record<string, unknown>): boolean =>
  normalize(visit?.visitStatus) === 'cancelled' || normalize(visit?.status) === 'cancelled';

const visitHasHaSignals = (visit: Record<string, unknown>): boolean => {
  if (!visit) return false;
  if (visit.hearingAidSale || visit.purchaseFromTrial) return true;
  if (visit.hearingAidBooked || Number(visit.bookingAdvanceAmount || 0) > 0) return true;
  if (visit.hearingAidTrial || visit.trialGiven) return true;
  const hs = normalize(visit.hearingAidStatus);
  if (
    ['not_interested', 'sold', 'booked', 'trial_given', 'trial_completed', 'trial_extended'].includes(
      hs
    )
  ) {
    return true;
  }
  const tr = normalize(visit.trialResult);
  if (['unsuccessful', 'ongoing', 'extended'].includes(tr)) return true;
  return false;
};

const pickVisitForStatus = (schedules: Record<string, unknown>[]): Record<string, unknown> | undefined => {
  if (!schedules.length) return undefined;
  const sorted = [...schedules].sort((a, b) => {
    const tb = getVisitSortTime(b);
    const ta = getVisitSortTime(a);
    return tb - ta;
  });
  for (const v of sorted) {
    if (!isVisitCancelled(v) || visitHasHaSignals(v)) return v;
  }
  return sorted[0];
};

const deriveFromLastVisit = (
  enquiry: Record<string, unknown>
): { key: EnquiryJourneyStatus; label: string; color: EnquiryStatusChipColor } => {
  const schedules = getVisitSchedules(enquiry) as Record<string, unknown>[];
  const financialStatus = normalize(
    (enquiry?.financialSummary as { paymentStatus?: string } | undefined)?.paymentStatus
  );
  const hasAnyProgress =
    schedules.length > 0 ||
    (Array.isArray(enquiry?.followUps) && (enquiry.followUps as unknown[]).length > 0) ||
    Boolean(enquiry?.assignedTo) ||
    Boolean(enquiry?.telecaller);

  if (schedules.length === 0) {
    if (hasAnyProgress) return journeyKeyToMeta('in_process');
    return journeyKeyToMeta('enquiry');
  }

  const v = pickVisitForStatus(schedules);
  if (!v) {
    if (hasAnyProgress) return journeyKeyToMeta('in_process');
    return journeyKeyToMeta('enquiry');
  }

  if (isVisitCancelled(v) && !visitHasHaSignals(v)) {
    return { key: 'in_process', label: 'Latest visit cancelled', color: 'default' };
  }

  if (
    normalize(v.hearingAidStatus) === 'not_interested' ||
    normalize(v.trialResult) === 'unsuccessful'
  ) {
    return journeyKeyToMeta('not_interested');
  }

  if (
    Boolean(v.hearingAidSale) ||
    Boolean(v.purchaseFromTrial) ||
    normalize(v.hearingAidStatus) === 'sold'
  ) {
    if (financialStatus === 'fully_paid') return journeyKeyToMeta('completed');
    return journeyKeyToMeta('sold');
  }

  if (
    Boolean(v.hearingAidBooked) ||
    Number(v.bookingAdvanceAmount || 0) > 0 ||
    normalize(v.hearingAidStatus) === 'booked'
  ) {
    return journeyKeyToMeta('booked');
  }

  if (
    Boolean(v.hearingAidTrial) ||
    Boolean(v.trialGiven) ||
    ['trial_given', 'trial_completed', 'trial_extended'].includes(normalize(v.hearingAidStatus)) ||
    ['ongoing', 'extended'].includes(normalize(v.trialResult))
  ) {
    return journeyKeyToMeta('in_trial');
  }

  if (normalize(v.visitStatus) === 'completed' || normalize(v.status) === 'completed') {
    return journeyKeyToMeta('in_process');
  }

  if (hasAnyProgress) return journeyKeyToMeta('in_process');
  return journeyKeyToMeta('enquiry');
};

export const getEnquiryStatusMeta = (
  enquiry: Record<string, unknown> | null | undefined
): {
  key: EnquiryJourneyStatus;
  label: string;
  color: EnquiryStatusChipColor;
  source: 'manual' | 'auto';
} => {
  if (!enquiry) {
    return { ...journeyKeyToMeta('enquiry'), source: 'auto' };
  }
  const manual = parseJourneyStatusOverride(enquiry.journeyStatusOverride);
  if (manual) {
    return { ...journeyKeyToMeta(manual), source: 'manual' };
  }
  return { ...deriveFromLastVisit(enquiry), source: 'auto' };
};
