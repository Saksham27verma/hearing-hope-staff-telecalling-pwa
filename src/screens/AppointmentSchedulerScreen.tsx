import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { IoAdd, IoFilter } from 'react-icons/io5';
import type { DateSelectArg, EventClickArg } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { endOfDay, startOfDay } from 'date-fns';
import type { AppShellOutletContext } from '../components/AppShell';
import { db } from '../firebase';
import type { Appointment, AppointmentStatus } from '../types';
import {
  exportAppointmentsAsImage,
  exportAppointmentsAsPDF,
  getApptStatus,
  upcomingAppointmentsList,
  type CenterRow,
  type StaffRow,
} from '../scheduler/appointmentExports';
import { sendNewAppointmentPush } from '../scheduler/notifyStaff';

import styles from './AppointmentSchedulerScreen.module.css';

type DraftAppointment = Omit<Appointment, 'id'> & { id?: string };

type EnquiryPickerRow = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  status?: string;
  address?: string;
  center?: string;
  telecaller?: string;
  reference?: string | string[];
};

function defaultDraft(): DraftAppointment {
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    enquiryId: '',
    patientName: '',
    patientPhone: '',
    reference: '',
    type: 'center',
    centerId: '',
    address: '',
    notes: '',
    telecaller: '',
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'scheduled',
  };
}

function enquiryRefString(ref: string | string[] | undefined): string {
  if (Array.isArray(ref)) return ref.filter(Boolean).join(', ');
  return ref || '';
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** CRM: staff can edit appointments; delete remains CRM-admin-only (not exposed here). */
const CAN_EDIT = true;

export default function AppointmentSchedulerScreen() {
  const { onLogout } = useOutletContext<AppShellOutletContext>();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [openDialog, setOpenDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAppointment>(defaultDraft);

  const [openPreview, setOpenPreview] = useState(false);
  const [previewAppt, setPreviewAppt] = useState<Appointment | null>(null);
  const [previewPhone, setPreviewPhone] = useState('');
  const [previewCenterName, setPreviewCenterName] = useState('');
  const [previewHomeVisitor, setPreviewHomeVisitor] = useState('');
  const [previewAssigned, setPreviewAssigned] = useState('');

  const [openPicker, setOpenPicker] = useState(false);
  const [allEnquiries, setAllEnquiries] = useState<EnquiryPickerRow[]>([]);
  const [enquirySearch, setEnquirySearch] = useState('');
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);

  const [selectedCenter, setSelectedCenter] = useState('all');
  const [selectedExecutive, setSelectedExecutive] = useState('all');

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const [saving, setSaving] = useState(false);

  const refreshStatic = useCallback(async () => {
    const [centersSnap, staffSnap] = await Promise.all([
      getDocs(collection(db, 'centers')),
      getDocs(collection(db, 'staff')),
    ]);
    setCenters(centersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as CenterRow[]);
    setStaffList(
      staffSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as StaffRow[]
    );
  }, []);

  useEffect(() => {
    void refreshStatic();
  }, [refreshStatic]);

  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('start', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAppointments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Appointment[]);
        setLoadErr(null);
      },
      (e) => setLoadErr(e.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!openPicker || allEnquiries.length > 0) return;
    let cancelled = false;
    setEnquiriesLoading(true);
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'enquiries'), orderBy('name')));
        if (!cancelled)
          setAllEnquiries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as EnquiryPickerRow[]);
      } catch {
        try {
          const snap = await getDocs(collection(db, 'enquiries'));
          if (!cancelled) {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as EnquiryPickerRow[];
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setAllEnquiries(list);
          }
        } catch {
          if (!cancelled) setAllEnquiries([]);
        }
      } finally {
        if (!cancelled) setEnquiriesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [openPicker, allEnquiries.length]);

  const filteredAppointments = useMemo(() => {
    let list = [...appointments];
    if (selectedCenter !== 'all') list = list.filter((a) => a.centerId === selectedCenter);
    if (selectedExecutive !== 'all') list = list.filter((a) => a.homeVisitorStaffId === selectedExecutive);
    return list;
  }, [appointments, selectedCenter, selectedExecutive]);

  const upcoming = useMemo(() => upcomingAppointmentsList(filteredAppointments), [filteredAppointments]);

  const filteredEnquiries = useMemo(() => {
    const qv = enquirySearch.trim().toLowerCase();
    if (!qv) return allEnquiries;
    return allEnquiries.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(qv) ||
        (e.phone || '').toLowerCase().includes(qv) ||
        (e.email || '').toLowerCase().includes(qv) ||
        (e.city || '').toLowerCase().includes(qv) ||
        (e.status || '').toLowerCase().includes(qv)
    );
  }, [allEnquiries, enquirySearch]);

  const events = useMemo(
    () =>
      filteredAppointments.map((a) => {
        const st = getApptStatus(a);
        const baseCenter = '#1976d2';
        const baseHome = '#43a047';
        let backgroundColor = a.type === 'center' ? baseCenter : baseHome;
        let borderColor = a.type === 'center' ? '#1565c0' : '#2e7d32';
        if (st === 'cancelled') {
          backgroundColor = '#9e9e9e';
          borderColor = '#616161';
        } else if (st === 'completed') {
          backgroundColor = '#2e7d32';
          borderColor = '#1b5e20';
        }
        return {
          id: a.id,
          title: `${st === 'cancelled' ? '✕ ' : st === 'completed' ? '✓ ' : ''}${a.patientName || a.title || 'Patient'}`,
          start: a.start,
          end: a.end,
          extendedProps: { ...a, status: st },
          backgroundColor,
          borderColor,
          classNames: st === 'cancelled' ? ['appt-cancelled'] : st === 'completed' ? ['appt-completed'] : [],
        };
      }),
    [filteredAppointments]
  );

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshStatic();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDateSelect = (info: DateSelectArg) => {
    setDraft({
      ...defaultDraft(),
      start: info.startStr,
      end: info.endStr,
    });
    setIsEditMode(false);
    setEditingId(null);
    setOpenDialog(true);
  };

  const handleEventClick = async (info: EventClickArg) => {
    const data = info.event.extendedProps as Appointment;
    setPreviewAppt(data);
    let phone = '';
    let centerName = '';
    let homeVisitorName = data.homeVisitorName || '';
    let assignedStaffName = data.assignedStaffName || '';
    try {
      if (data.enquiryId) {
        const enq = await getDoc(doc(db, 'enquiries', data.enquiryId));
        phone = (enq.data() as { phone?: string })?.phone || '';
      }
      if (data.centerId) {
        const cen = await getDoc(doc(db, 'centers', data.centerId));
        centerName = (cen.data() as { name?: string })?.name || '';
      }
      if (!homeVisitorName && data.homeVisitorStaffId) {
        const st = await getDoc(doc(db, 'staff', data.homeVisitorStaffId));
        homeVisitorName = (st.data() as { name?: string })?.name || '';
      }
      if (!assignedStaffName && data.assignedStaffId) {
        const st = await getDoc(doc(db, 'staff', data.assignedStaffId));
        assignedStaffName = (st.data() as { name?: string })?.name || '';
      }
    } catch {
      /* preview still usable */
    }
    setPreviewPhone(phone || data.patientPhone || '');
    setPreviewCenterName(centerName);
    setPreviewHomeVisitor(homeVisitorName);
    setPreviewAssigned(assignedStaffName);
    setOpenPreview(true);
  };

  const buildPayload = (d: DraftAppointment) => {
    const centerName = d.centerId ? centers.find((c) => c.id === d.centerId)?.name : '';
    return {
      title: d.patientName || d.title || '',
      enquiryId: d.enquiryId || '',
      patientName: d.patientName,
      patientPhone: d.patientPhone || '',
      reference: d.reference || '',
      type: d.type,
      centerId: d.centerId || '',
      centerName: centerName || undefined,
      address: d.address || '',
      homeVisitorStaffId: d.homeVisitorStaffId || '',
      homeVisitorName: d.homeVisitorName || '',
      assignedStaffId: d.assignedStaffId || '',
      assignedStaffName: d.assignedStaffName || '',
      telecaller: d.telecaller || '',
      notes: d.notes || '',
      start: d.start,
      end: d.end,
      status: (d.status || 'scheduled') as AppointmentStatus,
      feedback: d.feedback || '',
      updatedAt: serverTimestamp(),
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!draft.patientName?.trim()) throw new Error('Select a patient from enquiries');
      if (draft.type === 'center' && !draft.centerId) throw new Error('Select a center');
      if (draft.type === 'center' && !draft.assignedStaffId) throw new Error('Select staff for center visit');
      if (draft.type === 'home' && !draft.homeVisitorStaffId) throw new Error('Select staff for home visit');

      const payload = buildPayload(draft);

      if (isEditMode && editingId) {
        const prev = appointments.find((a) => a.id === editingId);
        const startChanged = Boolean(prev && prev.start !== draft.start);
        const patch: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
        if (startChanged) patch.pwaReminderSentForStart = deleteField();
        await updateDoc(doc(db, 'appointments', editingId), patch);
      } else {
        await addDoc(collection(db, 'appointments'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        const staffId = draft.type === 'home' ? draft.homeVisitorStaffId : draft.assignedStaffId;
        if (staffId) {
          void sendNewAppointmentPush({
            patientName: draft.patientName || draft.title || '',
            start: draft.start,
            homeVisitorStaffId: staffId,
          });
        }
      }

      setOpenDialog(false);
      setIsEditMode(false);
      setEditingId(null);
      setDraft(defaultDraft());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!previewAppt?.id) return;
    if (!window.confirm(`Delete appointment for ${previewAppt.patientName}?`)) return;
    try {
      await deleteDoc(doc(db, 'appointments', previewAppt.id));
      setOpenPreview(false);
    } catch {
      window.alert('Failed to delete');
    }
  };

  const openEditFromPreview = () => {
    if (!previewAppt?.id) return;
    setDraft({ ...previewAppt });
    setIsEditMode(true);
    setEditingId(previewAppt.id);
    setOpenPreview(false);
    setOpenDialog(true);
  };

  const handleCancelVisit = async () => {
    if (!previewAppt?.id) return;
    if (
      !window.confirm(
        `Cancel this visit for ${previewAppt.patientName || 'this patient'}? It will stay on the calendar as cancelled.`
      )
    )
      return;
    try {
      await updateDoc(doc(db, 'appointments', previewAppt.id), {
        status: 'cancelled' as AppointmentStatus,
        updatedAt: serverTimestamp(),
      });
      setOpenPreview(false);
    } catch {
      window.alert('Failed to cancel');
    }
  };

  const handleMarkCompleted = async () => {
    if (!previewAppt?.id) return;
    try {
      await updateDoc(doc(db, 'appointments', previewAppt.id), {
        status: 'completed' as AppointmentStatus,
        updatedAt: serverTimestamp(),
      });
      setOpenPreview(false);
    } catch {
      window.alert('Failed to update');
    }
  };

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const openReschedule = () => {
    if (!previewAppt?.start) return;
    setRescheduleAt(toDatetimeLocal(previewAppt.start));
    setRescheduleOpen(true);
  };

  const confirmReschedule = async () => {
    if (!previewAppt?.id || !rescheduleAt) return;
    const origStart = new Date(previewAppt.start);
    const origEnd = new Date(previewAppt.end || previewAppt.start);
    const newStart = new Date(rescheduleAt);
    if (!sameDay(newStart, origStart)) {
      window.alert('Choose a time on the same calendar day as the original appointment.');
      return;
    }
    const duration = Math.max(15 * 60 * 1000, origEnd.getTime() - origStart.getTime());
    const newEnd = new Date(newStart.getTime() + duration);
    setRescheduleSaving(true);
    try {
      await updateDoc(doc(db, 'appointments', previewAppt.id), {
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        updatedAt: serverTimestamp(),
        pwaReminderSentForStart: deleteField(),
      });
      setRescheduleOpen(false);
      setOpenPreview(false);
    } catch {
      window.alert('Failed to reschedule');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const scheduleAnotherVisit = () => {
    if (!previewAppt) return;
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({
      ...defaultDraft(),
      enquiryId: previewAppt.enquiryId || '',
      patientName: previewAppt.patientName || previewAppt.title || '',
      patientPhone: previewAppt.patientPhone || previewPhone || '',
      reference: previewAppt.reference || '',
      type: previewAppt.type,
      centerId: previewAppt.centerId || '',
      address: previewAppt.address || '',
      homeVisitorStaffId: previewAppt.homeVisitorStaffId || '',
      homeVisitorName: previewAppt.homeVisitorName || '',
      assignedStaffId: previewAppt.assignedStaffId || '',
      assignedStaffName: previewAppt.assignedStaffName || '',
      telecaller: previewAppt.telecaller || '',
      notes: '',
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'scheduled',
    });
    setOpenPreview(false);
    setIsEditMode(false);
    setEditingId(null);
    setOpenDialog(true);
  };

  const minReschedule = previewAppt ? startOfDay(new Date(previewAppt.start)) : undefined;
  const maxReschedule = previewAppt ? endOfDay(new Date(previewAppt.start)) : undefined;

  const selectEnquiry = (e: EnquiryPickerRow) => {
    setDraft((prev) => ({
      ...prev,
      enquiryId: e.id,
      patientName: e.name || '',
      patientPhone: e.phone || '',
      reference: enquiryRefString(e.reference),
      address: e.address || prev.address,
      centerId: (e.center as string) || prev.centerId,
      telecaller: e.telecaller || prev.telecaller,
      status: 'scheduled',
    }));
    setOpenPicker(false);
  };

  const openNewAppointment = () => {
    setDraft(defaultDraft());
    setIsEditMode(false);
    setEditingId(null);
    setOpenDialog(true);
  };

  const pickerPortal =
    openPicker &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className={styles.overlayPicker}
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) setOpenPicker(false);
        }}
      >
        <div className={styles.sheetPicker} onClick={(e) => e.stopPropagation()}>
          <div className={styles.sheetHeader}>
            <h2 id="picker-title" className={styles.sheetTitle}>
              Choose enquiry
            </h2>
            <button type="button" className={styles.closeX} onClick={() => setOpenPicker(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className={styles.sheetBody}>
            <input
              className={styles.input}
              placeholder="Search name, phone, email…"
              value={enquirySearch}
              onChange={(ev) => setEnquirySearch(ev.target.value)}
              autoFocus
            />
            <div className={styles.pickerList}>
              {filteredEnquiries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={styles.pickerCard}
                  onClick={() => selectEnquiry(e)}
                >
                  <span className={styles.pickerCardName}>{e.name || '—'}</span>
                  <span className={styles.pickerCardMeta}>{e.phone || 'No phone'}</span>
                </button>
              ))}
              {filteredEnquiries.length === 0 ? (
                <p className={styles.pickerEmpty}>{enquiriesLoading ? 'Loading…' : 'No enquiries match'}</p>
              ) : null}
            </div>
          </div>
          <div className={styles.sheetActions}>
            <button type="button" className={styles.btn} onClick={() => setOpenPicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className={styles.page}>
      <header className={styles.appBar}>
        <div className={styles.appBarMain}>
          <h1 className={styles.appTitle}>Calendar</h1>
          <div className={styles.appBarActions}>
            <button
              type="button"
              className={styles.appBarIconBtn}
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Filters and more"
            >
              <IoFilter size={22} />
            </button>
            <button type="button" className={styles.appBarTextBtn} onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {(selectedCenter !== 'all' || selectedExecutive !== 'all') && (
        <div className={styles.filterChips}>
          {selectedCenter !== 'all' && (
            <span className={styles.chip}>
              {centers.find((c) => c.id === selectedCenter)?.name}
              <button type="button" className={styles.chipRemove} onClick={() => setSelectedCenter('all')} aria-label="Clear center">
                ×
              </button>
            </span>
          )}
          {selectedExecutive !== 'all' && (
            <span className={styles.chip}>
              {staffList.find((s) => s.id === selectedExecutive)?.name}
              <button type="button" className={styles.chipRemove} onClick={() => setSelectedExecutive('all')} aria-label="Clear executive">
                ×
              </button>
            </span>
          )}
          <button type="button" className={styles.chipClear} onClick={() => { setSelectedCenter('all'); setSelectedExecutive('all'); }}>
            Clear filters
          </button>
        </div>
      )}

      {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

      <div className={styles.calendarShell}>
        <div className={styles.calendarCard}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'timeGridDay,dayGridMonth,listWeek',
            }}
            buttonText={{ today: 'Today', day: 'Day', month: 'Month', listWeek: 'Agenda' }}
            initialView="listWeek"
            selectable
            selectMirror
            nowIndicator
            dayMaxEvents
            events={events}
            select={handleDateSelect}
            eventClick={handleEventClick}
            height="auto"
            eventDisplay="list-item"
            dayMaxEventRows={3}
            moreLinkClick="popover"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            scrollTime="08:00:00"
            views={{
              dayGridMonth: { dayMaxEventRows: 3, moreLinkClick: 'popover' },
              timeGridDay: {
                slotMinTime: '07:00:00',
                slotMaxTime: '21:00:00',
                slotDuration: '00:30:00',
                slotLabelInterval: '01:00',
              },
              timeGridWeek: {
                slotMinTime: '07:00:00',
                slotMaxTime: '21:00:00',
              },
              listWeek: { duration: { days: 7 }, listDayFormat: { weekday: 'short', day: 'numeric', month: 'short' } },
            }}
          />
        </div>
      </div>

      <button type="button" className={styles.fab} onClick={openNewAppointment} aria-label="New appointment">
        <IoAdd size={32} />
      </button>

      {/* Filters sheet */}
      {filterSheetOpen ? (
        <div
          className={styles.overlayFilters}
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setFilterSheetOpen(false);
          }}
        >
          <div className={styles.sheetFilters} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>Display & export</h2>
              <button type="button" className={styles.closeX} onClick={() => setFilterSheetOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.sheetBody}>
              <label className={styles.field}>
                <span className={styles.label}>Center</span>
                <select
                  className={styles.input}
                  value={selectedCenter}
                  onChange={(ev) => setSelectedCenter(ev.target.value)}
                >
                  <option value="all">All centers</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Home visit executive</span>
                <select
                  className={styles.input}
                  value={selectedExecutive}
                  onChange={(ev) => setSelectedExecutive(ev.target.value)}
                >
                  <option value="all">All</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.sheetPrimaryBtn}
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing…' : 'Refresh calendar'}
              </button>
              <p className={styles.label} style={{ marginTop: '1rem' }}>
                Export upcoming
              </p>
              <div className={styles.exportBtns}>
                <button
                  type="button"
                  className={styles.sheetSecondaryBtn}
                  onClick={() => {
                    void exportAppointmentsAsImage(upcoming, centers, staffList).catch(() => window.alert('Export failed'));
                  }}
                >
                  PNG
                </button>
                <button
                  type="button"
                  className={styles.sheetSecondaryBtn}
                  onClick={() => {
                    void exportAppointmentsAsPDF(upcoming, centers, staffList).catch(() => window.alert('Export failed'));
                  }}
                >
                  PDF
                </button>
              </div>
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btnPrimary} onClick={() => setFilterSheetOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Preview */}
      {openPreview && previewAppt ? (
        <div className={styles.overlayPreview} role="dialog" aria-modal="true">
          <div className={styles.sheet}>
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>Appointment</h2>
              <button type="button" className={styles.closeX} onClick={() => setOpenPreview(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.sheetBody}>
              <p className={styles.label}>Patient</p>
              <p className={styles.value} style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                {previewAppt.patientName || '—'}
              </p>
              {(() => {
                const st = getApptStatus(previewAppt);
                return (
                  <span
                    className={`${styles.statusPill} ${st === 'scheduled' ? styles.statusSched : st === 'completed' ? styles.statusDone : styles.statusCan}`}
                  >
                    {st === 'scheduled' ? 'Scheduled' : st === 'completed' ? 'Completed' : 'Cancelled'}
                  </span>
                );
              })()}
              {previewPhone ? (
                <a className={styles.value} href={`tel:${previewPhone.replace(/\D/g, '')}`}>
                  {previewPhone}
                </a>
              ) : null}
              {previewAppt.reference ? (
                <>
                  <p className={styles.label}>Reference</p>
                  <p className={styles.value}>{previewAppt.reference}</p>
                </>
              ) : null}
              <p className={styles.label}>Type</p>
              <p className={styles.value}>{previewAppt.type === 'center' ? 'Center visit' : 'Home visit'}</p>
              {previewAppt.type === 'center' ? (
                <>
                  <p className={styles.label}>Center</p>
                  <p className={styles.value}>{previewCenterName || '—'}</p>
                  <p className={styles.label}>Assigned to</p>
                  <p className={styles.value}>{previewAssigned || '—'}</p>
                </>
              ) : (
                <>
                  <p className={styles.label}>Address</p>
                  <p className={styles.value}>{previewAppt.address || '—'}</p>
                  <p className={styles.label}>Home visit by</p>
                  <p className={styles.value}>{previewHomeVisitor || '—'}</p>
                </>
              )}
              <p className={styles.label}>Date & time</p>
              <p className={styles.value}>{new Date(previewAppt.start).toLocaleString()}</p>
              {previewAppt.notes ? (
                <>
                  <p className={styles.label}>Notes</p>
                  <p className={styles.value} style={{ whiteSpace: 'pre-wrap' }}>
                    {previewAppt.notes}
                  </p>
                </>
              ) : null}
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btn} onClick={() => setOpenPreview(false)}>
                Close
              </button>
              {CAN_EDIT && (
                <>
                  <button type="button" className={styles.btn} onClick={scheduleAnotherVisit}>
                    Another visit (other day)
                  </button>
                  {getApptStatus(previewAppt) === 'scheduled' && (
                    <>
                      <button type="button" className={styles.btn} onClick={openReschedule}>
                        Reschedule (same day)
                      </button>
                      <button type="button" className={styles.btnWarn} onClick={() => void handleCancelVisit()}>
                        Cancel visit
                      </button>
                      <button type="button" className={styles.btnOk} onClick={() => void handleMarkCompleted()}>
                        Mark completed
                      </button>
                    </>
                  )}
                  <button type="button" className={styles.btnOrange} onClick={openEditFromPreview}>
                    Edit
                  </button>
                  <button type="button" className={styles.btnWarn} onClick={() => void handleDelete()}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Reschedule */}
      {rescheduleOpen && previewAppt ? (
        <div className={styles.overlayReschedule} role="dialog" aria-modal="true">
          <div className={styles.sheet} style={{ maxWidth: 400 }}>
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>Reschedule (same day)</h2>
              <button type="button" className={styles.closeX} onClick={() => !rescheduleSaving && setRescheduleOpen(false)}>
                ×
              </button>
            </div>
            <div className={styles.sheetBody}>
              <p className={styles.value}>
                New time on{' '}
                <strong>
                  {new Date(previewAppt.start).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
                . Duration unchanged.
              </p>
              <label className={styles.field}>
                <span className={styles.label}>New date & time</span>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={rescheduleAt}
                  min={minReschedule ? toDatetimeLocal(minReschedule.toISOString()) : undefined}
                  max={maxReschedule ? toDatetimeLocal(maxReschedule.toISOString()) : undefined}
                  onChange={(ev) => setRescheduleAt(ev.target.value)}
                  disabled={rescheduleSaving}
                />
              </label>
            </div>
            <div className={styles.sheetActions}>
              <button type="button" className={styles.btn} onClick={() => setRescheduleOpen(false)} disabled={rescheduleSaving}>
                Back
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => void confirmReschedule()} disabled={rescheduleSaving || !rescheduleAt}>
                {rescheduleSaving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* New / Edit */}
      {openDialog ? (
        <div className={styles.overlayForm} role="dialog" aria-modal="true">
          <div className={styles.sheet} style={{ maxWidth: 560 }}>
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>{isEditMode ? 'Edit appointment' : 'New appointment'}</h2>
              <button
                type="button"
                className={styles.closeX}
                onClick={() => {
                  setOpenDialog(false);
                  setIsEditMode(false);
                  setEditingId(null);
                  setDraft(defaultDraft());
                }}
              >
                ×
              </button>
            </div>
            <div className={styles.sheetBody}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Patient</span>
                  <input
                    className={`${styles.input} ${styles.patientPick}`}
                    readOnly
                    value={draft.patientName}
                    placeholder="Tap to pick from enquiries"
                    onClick={() => setOpenPicker(true)}
                  />
                </label>
                {draft.patientPhone ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Phone</span>
                    <input className={styles.input} readOnly value={draft.patientPhone} />
                  </label>
                ) : null}
                {draft.reference ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Reference</span>
                    <input className={styles.input} readOnly value={draft.reference} />
                  </label>
                ) : null}
                <div className={styles.field}>
                  <span className={styles.label}>Visit type</span>
                  <div className={styles.toggleRow}>
                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${draft.type === 'center' ? styles.toggleBtnActive : ''}`}
                      onClick={() => setDraft((p) => ({ ...p, type: 'center' }))}
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggleBtn} ${draft.type === 'home' ? styles.toggleBtnActive : ''}`}
                      onClick={() => setDraft((p) => ({ ...p, type: 'home' }))}
                    >
                      Home
                    </button>
                  </div>
                </div>
                {draft.type === 'center' ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Center</span>
                      <select
                        className={styles.input}
                        value={draft.centerId}
                        onChange={(ev) => setDraft((p) => ({ ...p, centerId: ev.target.value }))}
                      >
                        <option value="">Select…</option>
                        {centers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Assign to (staff)</span>
                      <select
                        className={styles.input}
                        value={draft.assignedStaffId}
                        onChange={(ev) => {
                          const s = staffList.find((x) => x.id === ev.target.value);
                          setDraft((p) => ({
                            ...p,
                            assignedStaffId: ev.target.value,
                            assignedStaffName: s?.name || '',
                          }));
                        }}
                      >
                        <option value="">Select…</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Home address</span>
                      <input
                        className={styles.input}
                        value={draft.address}
                        onChange={(ev) => setDraft((p) => ({ ...p, address: ev.target.value }))}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Home visit by</span>
                      <select
                        className={styles.input}
                        value={draft.homeVisitorStaffId}
                        onChange={(ev) => {
                          const s = staffList.find((x) => x.id === ev.target.value);
                          setDraft((p) => ({
                            ...p,
                            homeVisitorStaffId: ev.target.value,
                            homeVisitorName: s?.name || '',
                          }));
                        }}
                      >
                        <option value="">Select…</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label className={styles.field}>
                  <span className={styles.label}>Start</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={toDatetimeLocal(draft.start)}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      if (!v) return;
                      const startIso = new Date(v).toISOString();
                      const endIso = new Date(new Date(v).getTime() + 60 * 60 * 1000).toISOString();
                      setDraft((p) => ({ ...p, start: startIso, end: endIso }));
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--hh-text2)' }}>Default duration 1 hour (adjust end in CRM if needed)</span>
                </label>
                {isEditMode ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Status</span>
                    <select
                      className={styles.input}
                      value={draft.status || 'scheduled'}
                      onChange={(ev) =>
                        setDraft((p) => ({ ...p, status: ev.target.value as AppointmentStatus }))
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                ) : null}
                <label className={styles.field}>
                  <span className={styles.label}>Notes</span>
                  <textarea
                    className={styles.textarea}
                    value={draft.notes}
                    onChange={(ev) => setDraft((p) => ({ ...p, notes: ev.target.value }))}
                    placeholder="Instructions…"
                  />
                </label>
              </div>
            </div>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  setOpenDialog(false);
                  setIsEditMode(false);
                  setEditingId(null);
                  setDraft(defaultDraft());
                }}
              >
                Cancel
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pickerPortal}
    </div>
  );
}
