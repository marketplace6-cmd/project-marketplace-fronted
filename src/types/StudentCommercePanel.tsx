import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import { ProjectDTO } from './types';
import {
  CommerceNotification,
  MeetingRecordDTO,
  SelectionRecord,
  StudentCommerceAPI,
  StudentOrderRecord
} from './commerceService';
import { VerificationApiError } from './verificationService';

const AVAILABLE_TIME_SLOTS = [
  '10:00 AM - 10:05 AM',
  '10:30 AM - 10:35 AM',
  '11:00 AM - 11:05 AM',
  '11:30 AM - 11:35 AM',
  '02:00 PM - 02:05 PM',
  '02:30 PM - 02:35 PM',
  '03:00 PM - 03:05 PM',
  '03:30 PM - 03:35 PM',
  '04:00 PM - 04:05 PM',
  '04:30 PM - 04:35 PM',
  '05:00 PM - 05:05 PM'
];

interface StudentCommercePanelProps {
  view: 'selected' | 'meetings' | 'orders';
  accessToken?: string;
  studentId?: string;
  studentEmail?: string;
  studentName?: string;
  projects: ProjectDTO[];
  viewedProjectIds?: string[];
  onSelectionChange?: (projectIds: string[]) => void;
  onToggleSelection?: (projectId: string) => Promise<void>;
  onSessionExpired: () => void;
  onLogin: () => void;
  onNavigate?: (tab: string) => void;
}

function paymentLabel(status: string | null) {
  if (!status) return 'Not recorded';
  if (status === 'AWAITING_VERIFICATION') return 'Awaiting UTR Verification';
  if (status === 'PAID') return 'Paid & Verified';
  if (status === 'REJECTED') return 'Payment Rejected';
  return status.toLowerCase().replace(/_/g, ' ');
}

function meetingLabel(status: string) {
  if (status === 'SCHEDULED') return 'Scheduled (Meet Link Active)';
  if (status === 'PENDING') return 'Pending Mentor Confirmation';
  if (status === 'REJECTED') return 'Declined';
  if (status === 'COMPLETED') return 'Completed';
  return status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudentCommercePanel({
  view,
  accessToken,
  studentId,
  studentEmail,
  studentName,
  projects,
  viewedProjectIds = [],
  onSelectionChange,
  onToggleSelection,
  onSessionExpired,
  onLogin
}: StudentCommercePanelProps) {
  const [orders, setOrders] = useState<StudentOrderRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecordDTO[]>([]);
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  const [notifications, setNotifications] = useState<CommerceNotification[]>([]);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [minimumMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Invoice Modal State
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<StudentOrderRecord | null>(null);

  const studentIdentifier = studentId || studentEmail || '';

  const refresh = useCallback(async () => {
    if (!accessToken && !studentIdentifier) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      if (view === 'orders') {
        const fetchedOrders = await StudentCommerceAPI.listOrders(accessToken, studentIdentifier);
        setOrders(fetchedOrders);
      } else {
        const [currentMeetings, currentSelections, currentNotifications] = await Promise.all([
          StudentCommerceAPI.listMeetings(accessToken, studentIdentifier),
          StudentCommerceAPI.listSelections(accessToken),
          StudentCommerceAPI.listNotifications(accessToken)
        ]);
        setMeetings(currentMeetings);
        setSelections(currentSelections);
        setNotifications(currentNotifications.filter((item) => item.notification_type.startsWith('meeting_')));
        onSelectionChange?.(currentSelections.map((item) => String(item.project_id)));
      }
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load your records from database.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, studentIdentifier, onSelectionChange, onSessionExpired, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submitMeeting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken && !studentIdentifier) {
      onLogin();
      return;
    }

    // Check active meetings limit (max 3)
    const activeMeetingsCount = meetings.filter(
      (m) => !['CANCELLED', 'COMPLETED', 'REJECTED'].includes(m.status)
    ).length;
    if (activeMeetingsCount >= 3) {
      setRequestMessage('Maximum limit reached: You can have at most 3 active guidance meetings.');
      return;
    }

    const values = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const projectId = Number(values.get('project_id'));
    const date = String(values.get('date') || '');
    const slot = String(values.get('slot') || values.get('time') || '');
    if (!Number.isInteger(projectId) || !date || !slot) {
      setRequestMessage('Choose a project, date, and 5-minute time slot.');
      return;
    }

    const selectedProj = projects.find((p) => Number(p.id) === projectId);
    const projectTitle = selectedProj?.title || `Project #${projectId}`;

    // Parse start time from slot if available
    let startIso = new Date(`${date}T10:00:00`).toISOString();
    let endIso = new Date(`${date}T10:05:00`).toISOString();
    try {
      const match = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridian = match[3].toUpperCase();
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;
        const s = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
        const e = new Date(s.getTime() + 5 * 60_000);
        startIso = s.toISOString();
        endIso = e.toISOString();
      }
    } catch {
      // fallback to default
    }

    setSubmitting(true);
    setRequestMessage('');
    try {
      await StudentCommerceAPI.createMeeting({
        student_id: studentId || studentEmail || 'student',
        student_name: studentName || 'Verified Student',
        student_email: studentEmail || '',
        project_id: projectId,
        project_title: projectTitle,
        start_time: startIso,
        end_time: endIso,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        requested_date: date,
        time_slot: slot
      });
      setRequestMessage('Meeting request submitted successfully! Admin will assign Google Meet link shortly.');
      await refresh();
      form.reset();
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setRequestMessage(requestError instanceof Error ? requestError.message : 'Unable to request the meeting.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadZip = (order: StudentOrderRecord) => {
    if (order.deliverable_url) {
      window.open(order.deliverable_url, '_blank', 'noopener,noreferrer');
    } else {
      alert('The project deliverable ZIP is being finalized by our team and will be attached here shortly. Please check back soon or contact support.');
    }
  };

  if (!accessToken && !studentIdentifier) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Sign in to view your account records</h2>
        <p className="mt-1 text-sm text-slate-600">Orders, selections, and meeting links are private to your student account.</p>
        <button type="button" onClick={onLogin} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Student sign in</button>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
        <LoaderCircle size={18} className="animate-spin" /> Loading {view} from database…
      </div>
    );
  }

  const activeMeetings = meetings.filter(
    (m) => !['CANCELLED', 'COMPLETED', 'REJECTED'].includes(m.status)
  );

  return (
    <section className="space-y-5">
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="font-semibold underline">Retry</button>
        </div>
      )}

      {view === 'orders' ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">My Orders & Purchases</h2>
              <p className="text-xs text-slate-500 mt-0.5">Track payment verification status, download project ZIP deliverables, and access official invoices.</p>
            </div>
            <button
              type="button"
              onClick={() => { setLoading(true); void refresh(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              aria-label="Refresh orders"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 space-y-2">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-700">No project orders found yet.</p>
              <p className="text-xs text-slate-400">When you purchase a project via UPI QR, your order and download link will appear here.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-y border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Order / Invoice</th>
                    <th className="px-3 py-3 font-semibold">Project</th>
                    <th className="px-3 py-3 font-semibold">Amount</th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Payment Status</th>
                    <th className="px-3 py-3 font-semibold text-right">Actions & Deliverables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => {
                    const isPaid = order.payment_status === 'PAID';
                    const isAwaiting = order.payment_status === 'AWAITING_VERIFICATION' || order.status === 'PENDING';
                    const isRejected = order.payment_status === 'REJECTED';

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-3 font-mono">
                          <span className="font-bold text-slate-900 block">{order.invoice_number || `INV-2026-${order.id}`}</span>
                          <span className="text-[10px] text-slate-500">ID #{order.id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-bold text-slate-900">{order.project_title}</p>
                          {order.utr_number && (
                            <p className="font-mono text-[10px] text-slate-500">UTR: {order.utr_number}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 font-extrabold text-slate-900">
                          ₹{order.amount.toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {new Date(order.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-3 py-3">
                          {isPaid && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 size={12} /> Paid & Verified
                            </span>
                          )}
                          {isAwaiting && !isPaid && !isRejected && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                              <Clock size={12} /> Awaiting UTR Verification
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                              <AlertTriangle size={12} /> Payment Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {isPaid && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadZip(order)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                                  title="Download project code and files"
                                >
                                  <Download size={13} /> Download (.ZIP)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedInvoiceOrder(order)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                  title="View and print invoice"
                                >
                                  <Printer size={13} /> Invoice
                                </button>
                              </>
                            )}
                            {!isPaid && (
                              <span className="text-[11px] text-slate-400 italic">
                                {isAwaiting ? 'Deliverables unlock after admin verifies UTR' : 'Verification declined'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : (
        <>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {view === 'selected' ? 'Selected Projects for Guidance' : 'Your Guidance Meetings'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Request a 5-minute 1-on-1 scheduled Google Meet session with an engineering mentor (Max 3 active sessions).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-900">
                  {activeMeetings.length} / 3 Active Meetings
                </span>
                <button
                  type="button"
                  onClick={() => { setLoading(true); void refresh(); }}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                  aria-label="Refresh meetings"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {view === 'selected' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects
                  .filter((project) => viewedProjectIds.includes(project.id))
                  .map((project) => {
                    const isSelected = selections.some((selection) => String(selection.project_id) === project.id);
                    const associatedMeeting = meetings.find((meeting) => String(meeting.project_id) === project.id);
                    return (
                      <article key={project.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 flex flex-col justify-between">
                        <div>
                          <p className="font-mono text-[10px] text-slate-500">{project.projectCode || project.id}</p>
                          <h3 className="mt-1 text-sm font-bold text-slate-900">{project.title}</h3>
                          <p className="mt-2 text-xs text-slate-600">
                            Status:{' '}
                            <strong className="text-slate-800">
                              {associatedMeeting ? meetingLabel(associatedMeeting.status) : 'No meeting requested'}
                            </strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await onToggleSelection?.(project.id);
                            await refresh();
                          }}
                          className={`mt-4 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                            isSelected
                              ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                          }`}
                        >
                          {isSelected ? 'Remove selection' : 'Select for guidance'}
                        </button>
                      </article>
                    );
                  })}
                {projects.filter((project) => viewedProjectIds.includes(project.id)).length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-slate-500">
                    Preview at least one project PPT from the Explore Catalogue before selecting it for guidance.
                  </p>
                )}
              </div>
            )}

            {/* Meeting Booking Form */}
            {view === 'selected' && selections.length > 0 && (
              <form onSubmit={submitMeeting} className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[1fr_160px_180px_auto] sm:gap-3 sm:items-end">
                <label className="block text-xs font-bold text-slate-700">
                  Selected Project
                  <select
                    name="project_id"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal"
                  >
                    {selections.map((selection) => {
                      const project = projects.find((item) => Number(item.id) === selection.project_id);
                      return (
                        <option key={selection.id} value={selection.project_id}>
                          {project?.title || `Project #${selection.project_id}`}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Session Date
                  <input
                    name="date"
                    type="date"
                    min={minimumMeetingDate}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  5-Min Time Slot
                  <select
                    name="slot"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal"
                  >
                    {AVAILABLE_TIME_SLOTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={submitting || activeMeetings.length >= 3}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <LoaderCircle size={14} className="animate-spin" /> : <CalendarDays size={14} />}
                  Request 5-Min Meet ({activeMeetings.length}/3)
                </button>
              </form>
            )}

            {view === 'selected' && requestMessage && (
              <p role="status" className="mt-3 rounded-lg bg-indigo-50 p-3 text-xs font-medium text-indigo-900 border border-indigo-200">
                {requestMessage}
              </p>
            )}

            {/* Meetings List */}
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                {view === 'selected' ? 'Current Scheduled & Requested Meetings' : 'Meeting Sessions'}
              </h3>
              {meetings.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No guidance meetings are recorded yet.</p>
              ) : (
                meetings.map((meeting) => (
                  <article
                    key={meeting.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">Meeting #{meeting.id}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            meeting.status === 'SCHEDULED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : meeting.status === 'REJECTED' || meeting.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {meetingLabel(meeting.status)}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{meeting.project_title}</h4>
                      <p className="text-xs text-slate-600">
                        Date: <strong>{meeting.requested_date || new Date(meeting.start_time).toLocaleDateString()}</strong> · Slot: <strong>{meeting.time_slot || new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> (5 Minutes)
                      </p>
                    </div>

                    <div>
                      {meeting.status === 'SCHEDULED' && meeting.google_meet_url ? (
                        <a
                          href={meeting.google_meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          Join Google Meet <ExternalLink size={13} />
                        </a>
                      ) : meeting.status === 'PENDING' ? (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                          <Clock size={13} /> Waiting for Admin to assign Meet Link
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Session {meeting.status.toLowerCase()}</span>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </article>

          {view === 'meetings' && notifications.length > 0 && (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900">Meeting Notifications</h3>
              <ul className="mt-3 space-y-2">
                {notifications.slice(0, 5).map((notification) => (
                  <li key={notification.id} className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
                    <p>{notification.message}</p>
                    <time className="mt-1 block text-[10px] opacity-70">
                      {new Date(notification.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </>
      )}

      {/* PRINTABLE INVOICE BILL MODAL */}
      {selectedInvoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Controls Header (Hidden during print) */}
            <div className="no-print flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
              <span className="text-xs font-bold text-slate-600">Official Purchase Invoice</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <Printer size={13} /> Print Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceOrder(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Printable Content Area */}
            <div id="printable-invoice" className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-800">
              {/* Invoice Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-lg">
                      U
                    </div>
                    <div>
                      <h1 className="text-xl font-extrabold tracking-tight text-slate-900">UNIKART</h1>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Student Project Marketplace</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">unikart.serveme.in · Academic Project Licensing</p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 uppercase tracking-wide">
                    PAID &amp; VERIFIED
                  </span>
                  <p className="mt-1 text-xs font-mono font-bold text-slate-900">
                    {selectedInvoiceOrder.invoice_number || `INV-2026-${selectedInvoiceOrder.id}`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Date: {new Date(selectedInvoiceOrder.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              {/* Billed To / Student Info */}
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Billed To (Student):</p>
                  <p className="mt-1 font-bold text-slate-900">{selectedInvoiceOrder.student_name || studentName || 'Verified Student'}</p>
                  <p className="text-slate-600">{selectedInvoiceOrder.student_email || studentEmail || '-'}</p>
                  <p className="text-slate-500 font-mono text-[11px]">Student ID: {selectedInvoiceOrder.student_id || studentId || selectedInvoiceOrder.user_id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Payment Summary:</p>
                  <p className="mt-1 text-slate-700">Mode: <strong>UPI Transfer (unikart@upi)</strong></p>
                  <p className="text-slate-700 font-mono text-[11px]">Bank Ref / UTR: <strong className="text-slate-900">{selectedInvoiceOrder.utr_number || 'VERIFIED'}</strong></p>
                  <p className="text-emerald-700 font-semibold mt-1">Status: Confirmed by Admin Audit</p>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Item / Academic Project Description</th>
                      <th className="px-4 py-2.5 text-center">Qty</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{selectedInvoiceOrder.project_title}</p>
                        <p className="text-[11px] text-slate-500">Source code, PPT presentation, and comprehensive project documentation.</p>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">1</td>
                      <td className="px-4 py-3 text-right font-medium">₹{selectedInvoiceOrder.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900">₹{selectedInvoiceOrder.amount.toFixed(2)}</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50 text-slate-700 font-semibold">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-[11px]">Subtotal:</td>
                      <td className="px-4 py-2 text-right">₹{selectedInvoiceOrder.amount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-[11px]">Taxes / Academic Educational Discount:</td>
                      <td className="px-4 py-2 text-right text-emerald-700 font-medium">₹0.00</td>
                    </tr>
                    <tr className="border-t border-slate-300 text-sm font-extrabold text-slate-900">
                      <td colSpan={3} className="px-4 py-2.5 text-right">Total Paid:</td>
                      <td className="px-4 py-2.5 text-right text-emerald-800">₹{selectedInvoiceOrder.amount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Watermark / Seal Banner */}
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-emerald-700 shrink-0" />
                  <div>
                    <h5 className="text-xs font-bold text-emerald-950">VERIFIED ELECTRONIC RECEIPT</h5>
                    <p className="text-[10px] text-emerald-800">Digitally authenticated by Unikart Finance &amp; Verification Desk</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-[10px] text-emerald-800">SECURE ID: #{selectedInvoiceOrder.id}</span>
                </div>
              </div>

              {/* Terms Footer */}
              <div className="border-t border-slate-200 pt-3 text-[10px] text-slate-400 text-center leading-relaxed">
                This is a computer-generated tax invoice and requires no physical signature. Project deliverables are provided for academic learning and research reference under Unikart terms of service.
              </div>
            </div>

            {/* Print CSS */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                #printable-invoice, #printable-invoice * {
                  visibility: visible;
                }
                #printable-invoice {
                  position: fixed;
                  left: 0;
                  top: 0;
                  width: 100%;
                  margin: 0;
                  padding: 24px;
                  background: white;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
          </div>
        </div>
      )}
    </section>
  );
}
