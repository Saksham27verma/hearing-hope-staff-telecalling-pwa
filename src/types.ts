export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

/** Telecalling / follow-up row stored on `enquiries.followUps` (CRM parity). */
export interface EnquiryFollowUp {
  id: string;
  date?: string;
  remarks?: string;
  nextFollowUpDate?: string;
  callerName?: string;
  createdAt?: unknown;
}

/** Firestore enquiry document — PWA uses a subset in types but reads full payloads at runtime. */
export interface Enquiry {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  subject?: string;
  address?: string;
  assignedTo?: string;
  telecaller?: string;
  center?: string;
  visitingCenter?: string;
  message?: string;
  reference?: string | string[];
  followUps?: EnquiryFollowUp[];
  followUpDate?: string;
  nextFollowUpDate?: string;
  createdAt?: unknown;
  journeyStatusOverride?: string | null;
  financialSummary?: { totalDue?: number; paymentStatus?: string };
  visits?: unknown[];
  visitSchedules?: unknown[];
  payments?: unknown[];
  paymentRecords?: unknown[];
}

export interface Appointment {
  id: string;
  title?: string;
  enquiryId?: string;
  patientName?: string;
  patientPhone?: string;
  reference?: string;
  type: 'center' | 'home';
  centerId?: string;
  centerName?: string;
  address?: string;
  homeVisitorStaffId?: string;
  homeVisitorName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  telecaller?: string;
  notes?: string;
  start: string;
  end: string;
  status?: AppointmentStatus;
  feedback?: string;
}
