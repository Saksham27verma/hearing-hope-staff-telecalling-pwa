import type { EnquiryStatusChipColor } from './enquiryStatus';

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return Boolean(value);
}

export function getVisits(enquiry: Record<string, unknown>): Record<string, unknown>[] {
  const v = enquiry?.visits;
  if (Array.isArray(v) && v.length > 0) return v as Record<string, unknown>[];
  const vs = enquiry?.visitSchedules;
  if (Array.isArray(vs) && vs.length > 0) return vs as Record<string, unknown>[];
  return [];
}

export function buildPaymentEntries(enquiry: Record<string, unknown>): Array<{
  label: string;
  amount: number;
  date?: string;
}> {
  const pr = enquiry?.paymentRecords;
  if (Array.isArray(pr) && pr.length > 0) {
    return (pr as Record<string, unknown>[]).map((payment) => ({
      label:
        payment.paymentType === 'hearing_aid_test'
          ? 'Test'
          : payment.paymentType === 'hearing_aid_booking'
            ? 'Booking'
            : payment.paymentType === 'hearing_aid_sale'
              ? 'Sale'
              : String(payment.paymentType || 'Payment'),
      amount: Number(payment.amount || 0),
      date: payment.paymentDate as string | undefined,
    }));
  }
  const pays = enquiry?.payments;
  if (Array.isArray(pays)) {
    return (pays as Record<string, unknown>[]).map((payment) => ({
      label:
        payment.paymentFor === 'hearing_test'
          ? 'Test'
          : payment.paymentFor === 'booking_advance'
            ? 'Booking'
            : payment.paymentFor === 'hearing_aid'
              ? 'Hearing Aid'
              : payment.paymentFor === 'accessory'
                ? 'Accessory'
                : payment.paymentFor === 'trial_home_security_deposit'
                  ? 'Trial security deposit'
                  : payment.paymentFor === 'programming'
                    ? 'Programming'
                    : payment.paymentFor === 'full_payment'
                      ? 'Full Payment'
                      : payment.paymentFor === 'partial_payment'
                        ? 'Partial Payment'
                        : String(payment.paymentFor || 'Payment'),
      amount: Number(payment.amount || 0),
      date: payment.paymentDate as string | undefined,
    }));
  }
  return [];
}

export function getBookingTotal(visit: Record<string, unknown>): number {
  return (Number(visit?.bookingSellingPrice) || 0) * (Number(visit?.bookingQuantity) || 1);
}

export function calculateDerivedTotalDue(visits: Record<string, unknown>[]): number {
  let total = 0;
  visits.forEach((visit) => {
    if (visit.hearingTest && Number(visit.testPrice) > 0) {
      total += Number(visit.testPrice) || 0;
    }
    if (visit.hearingAidBooked && !visit.hearingAidSale) {
      total += getBookingTotal(visit);
    } else if (visit.hearingAidSale || visit.purchaseFromTrial) {
      total += Number(visit.salesAfterTax) || 0;
    }
    if (visit.accessory && !visit.accessoryFOC) {
      total += (Number(visit.accessoryAmount) || 0) * (Number(visit.accessoryQuantity) || 1);
    }
    if (visit.programming) {
      total += Number(visit.programmingAmount) || 0;
    }
  });
  return total;
}

export function getPaymentSummary(enquiry: Record<string, unknown>, visits: Record<string, unknown>[]) {
  const fs = enquiry.financialSummary as { totalDue?: number } | undefined;
  const totalDue = Number(fs?.totalDue ?? calculateDerivedTotalDue(visits));
  const totalPaid = buildPaymentEntries(enquiry).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingAmount = Math.max(0, totalDue - totalPaid);
  const paymentStatus = pendingAmount <= 0 ? 'fully_paid' : totalPaid > 0 ? 'partial' : 'pending';
  return { totalDue, totalPaid, pendingAmount, paymentStatus };
}

export function formatCurrency(value?: number): string | undefined {
  if (!hasValue(value)) return undefined;
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export function getVisitDateLabel(visit: Record<string, unknown>): string {
  if (!visit?.visitDate && !visit?.date) return 'Not scheduled';
  return new Date((visit.visitDate || visit.date) as string).toLocaleDateString();
}

export type VisitServiceChip = { label: string; color: EnquiryStatusChipColor };

export function getVisitServices(visit: Record<string, unknown>): VisitServiceChip[] {
  const services: VisitServiceChip[] = [];
  if (visit.hearingTest) services.push({ label: 'Hearing Test', color: 'info' });
  if (visit.hearingAidTrial || visit.trialGiven) services.push({ label: 'Trial', color: 'warning' });
  if (visit.hearingAidBooked || hasValue(visit.bookingAdvanceAmount))
    services.push({ label: 'Booking', color: 'primary' });
  if (visit.hearingAidSale || visit.purchaseFromTrial) services.push({ label: 'Sale', color: 'success' });
  if (visit.accessory) services.push({ label: 'Accessory', color: 'secondary' });
  if (visit.programming) services.push({ label: 'Programming', color: 'default' });
  if (visit.repair) services.push({ label: 'Repair', color: 'error' });
  if (visit.counselling) services.push({ label: 'Counselling', color: 'default' });
  return services;
}

export function getVisitAmount(visit: Record<string, unknown>): number | undefined {
  if (!visit) return undefined;
  if (visit.hearingAidBooked && !visit.hearingAidSale) {
    const b = getBookingTotal(visit);
    if (b > 0) return b;
    if (hasValue(visit.bookingAdvanceAmount)) return Number(visit.bookingAdvanceAmount);
    if (hasValue(visit.hearingAidPrice)) return Number(visit.hearingAidPrice);
  }
  if (visit.hearingAidSale || visit.purchaseFromTrial) {
    const s = Number(visit.salesAfterTax) || Number(visit.hearingAidPrice);
    return Number.isFinite(s) && s !== 0 ? s : undefined;
  }
  const candidates = [
    visit.totalVisitAmount,
    visit.accessoryAmount,
    visit.programmingAmount,
    visit.repairAmount,
    visit.counsellingAmount,
    visit.testPrice,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return undefined;
}

export function getCenterName(
  visit: Record<string, unknown> | undefined,
  enquiry: Record<string, unknown>,
  centers: { id: string; name: string }[]
): string | undefined {
  const centerId = (visit?.centerId || enquiry.visitingCenter || enquiry.center) as string | undefined;
  if (!centerId) return undefined;
  return centers.find((c) => c.id === centerId)?.name || centerId;
}

export function formatCreatedAt(enquiry: Record<string, unknown>): string {
  const c = enquiry.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
  if (c && typeof c.toDate === 'function') {
    return c.toDate().toLocaleDateString('en-IN');
  }
  if (typeof c?.seconds === 'number') {
    return new Date(c.seconds * 1000).toLocaleDateString('en-IN');
  }
  return '—';
}

export function formatFollowUpDateCell(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

export function getApptStatus(a: Record<string, unknown>): 'scheduled' | 'completed' | 'cancelled' {
  if (a.status === 'completed') return 'completed';
  if (a.status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function appointmentStats(appointments: Record<string, unknown>[]) {
  const now = Date.now();
  let completed = 0;
  let cancelled = 0;
  let upcoming = 0;
  let pastScheduled = 0;
  appointments.forEach((a) => {
    const st = getApptStatus(a);
    const t = a.start ? new Date(a.start as string).getTime() : 0;
    if (st === 'completed') completed += 1;
    else if (st === 'cancelled') cancelled += 1;
    else if (t >= now) upcoming += 1;
    else pastScheduled += 1;
  });
  return { completed, cancelled, upcoming, pastScheduled, total: appointments.length };
}
