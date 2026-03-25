import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { Appointment } from '../types';

export type CenterRow = { id: string; name?: string };
export type StaffRow = { id: string; name?: string };

export function getApptStatus(apt: Appointment): 'scheduled' | 'completed' | 'cancelled' {
  const s = apt.status;
  if (s === 'completed' || s === 'cancelled') return s;
  return 'scheduled';
}

export function upcomingAppointmentsList(appointments: Appointment[]): Appointment[] {
  const now = new Date();
  return appointments
    .filter((apt) => {
      const st = getApptStatus(apt);
      if (st === 'cancelled' || st === 'completed') return false;
      return new Date(apt.start) >= now;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function exportAppointmentsAsImage(
  upcoming: Appointment[],
  centers: CenterRow[],
  staffList: StaffRow[]
): Promise<void> {
  const exportDiv = document.createElement('div');
  exportDiv.style.width = '800px';
  exportDiv.style.padding = '40px';
  exportDiv.style.backgroundColor = 'white';
  exportDiv.style.fontFamily = 'Arial, sans-serif';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows =
    upcoming.length === 0
      ? '<p style="text-align: center; color: #999; font-size: 18px; padding: 40px;">No upcoming appointments</p>'
      : upcoming
          .map((apt) => {
            const aptDate = new Date(apt.start);
            const ds = aptDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const ts = aptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const center = centers.find((c) => c.id === apt.centerId);
            const staff = staffList.find((s) => s.id === apt.homeVisitorStaffId);
            return `
                <div style="margin-bottom: 25px; padding: 20px; border: 2px solid ${apt.type === 'center' ? '#1976d2' : '#43a047'}; border-radius: 8px; background: ${apt.type === 'center' ? '#e3f2fd' : '#e8f5e9'};">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div>
                      <h2 style="margin: 0; color: #333; font-size: 24px;">${apt.patientName || 'Patient'}</h2>
                      <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">${apt.type === 'center' ? '🏢 Center Visit' : '🏠 Home Visit'}</p>
                    </div>
                    <div style="text-align: right;">
                      <p style="margin: 0; color: #1976d2; font-size: 18px; font-weight: bold;">${ds}</p>
                      <p style="margin: 5px 0 0 0; color: #666; font-size: 16px;">${ts}</p>
                    </div>
                  </div>
                  <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
                    ${center ? `<p style="margin: 5px 0; color: #555; font-size: 14px;"><strong>Enquiry Center:</strong> ${center.name}</p>` : ''}
                    ${apt.reference ? `<p style="margin: 5px 0; color: #555; font-size: 14px;"><strong>Reference:</strong> ${apt.reference}</p>` : ''}
                    ${apt.type === 'home' && staff ? `<p style="margin: 5px 0; color: #555; font-size: 14px;"><strong>Executive:</strong> ${staff.name}</p>` : ''}
                    ${apt.type === 'home' && apt.address ? `<p style="margin: 5px 0; color: #555; font-size: 14px;"><strong>Address:</strong> ${apt.address}</p>` : ''}
                    ${apt.notes ? `<p style="margin: 10px 0 0 0; color: #666; font-size: 13px; font-style: italic;">${apt.notes}</p>` : ''}
                  </div>
                </div>
              `;
          })
          .join('');

  exportDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1976d2; padding-bottom: 20px;">
          <h1 style="color: #1976d2; margin: 0; font-size: 32px;">Upcoming Appointments</h1>
          <p style="color: #666; margin: 10px 0 0 0; font-size: 16px;">Generated on ${dateStr}</p>
        </div>
        <div style="margin-top: 30px;">${rows}</div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">Hearing Hope — Appointment Schedule</p>
        </div>
      `;

  document.body.appendChild(exportDiv);
  try {
    const canvas = await html2canvas(exportDiv, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `appointments-${now.toISOString().split('T')[0]}.png`;
    link.href = imgData;
    link.click();
  } finally {
    document.body.removeChild(exportDiv);
  }
}

export async function exportAppointmentsAsPDF(
  upcoming: Appointment[],
  centers: CenterRow[],
  staffList: StaffRow[]
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;

  let yPos = margin;

  pdf.setFontSize(24);
  pdf.setTextColor(25, 118, 210);
  pdf.text('Upcoming Appointments', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setTextColor(100, 100, 100);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  pdf.text(`Generated on ${dateStr}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  pdf.setDrawColor(25, 118, 210);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  if (upcoming.length === 0) {
    pdf.setFontSize(14);
    pdf.setTextColor(150, 150, 150);
    pdf.text('No upcoming appointments', pageWidth / 2, yPos, { align: 'center' });
  } else {
    upcoming.forEach((apt) => {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFillColor(apt.type === 'center' ? 227 : 232, apt.type === 'center' ? 242 : 245, apt.type === 'center' ? 253 : 233);
      pdf.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');

      pdf.setDrawColor(apt.type === 'center' ? 25 : 67, apt.type === 'center' ? 118 : 160, apt.type === 'center' ? 210 : 71);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'D');

      yPos += 8;

      pdf.setFontSize(16);
      pdf.setTextColor(50, 50, 50);
      pdf.setFont('helvetica', 'bold');
      pdf.text(apt.patientName || 'Patient', margin + 5, yPos);

      const aptDate = new Date(apt.start);
      const ds = aptDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const ts = aptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      pdf.setFontSize(12);
      pdf.setTextColor(25, 118, 210);
      const dateWidth = pdf.getTextWidth(ds);
      pdf.text(ds, pageWidth - margin - 5 - dateWidth, yPos);
      yPos += 6;

      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${apt.type === 'center' ? 'Center Visit' : 'Home Visit'}`, margin + 5, yPos);

      const timeWidth = pdf.getTextWidth(ts);
      pdf.text(ts, pageWidth - margin - 5 - timeWidth, yPos);
      yPos += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);

      const center = centers.find((c) => c.id === apt.centerId);
      if (center) {
        pdf.text(`Enquiry Center: ${center.name}`, margin + 5, yPos);
        yPos += 5;
      }

      if (apt.reference) {
        pdf.text(`Reference: ${apt.reference}`, margin + 5, yPos);
        yPos += 5;
      }

      const staff = staffList.find((s) => s.id === apt.homeVisitorStaffId);
      if (apt.type === 'home' && staff) {
        pdf.text(`Executive: ${staff.name}`, margin + 5, yPos);
        yPos += 5;
      }

      if (apt.type === 'home' && apt.address) {
        const addressLines = pdf.splitTextToSize(`Address: ${apt.address}`, contentWidth - 10);
        pdf.text(addressLines, margin + 5, yPos);
        yPos += addressLines.length * 5;
      }

      if (apt.notes) {
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        const notesLines = pdf.splitTextToSize(apt.notes, contentWidth - 10);
        pdf.text(notesLines, margin + 5, yPos);
        yPos += notesLines.length * 5;
        pdf.setFont('helvetica', 'normal');
      }

      yPos += 10;
    });
  }

  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Hearing Hope — Appointment Schedule', pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  pdf.save(`appointments-${now.toISOString().split('T')[0]}.pdf`);
}
