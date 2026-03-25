/**
 * Mirrors CRM `POST /api/send-appointment-notification` (Expo push to assigned staff).
 * Uses same-origin `/api/...` in dev (Vite proxy) and on Vercel (serverless forward).
 */
export function getAppointmentNotifyUrl(): string {
  return '/api/send-appointment-notification';
}

export async function sendNewAppointmentPush(params: {
  patientName: string;
  start: string;
  homeVisitorStaffId: string;
}): Promise<void> {
  const url = getAppointmentNotifyUrl();
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // Non-blocking — same as CRM .catch on failure
  }
}
