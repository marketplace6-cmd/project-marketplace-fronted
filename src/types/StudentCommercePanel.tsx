import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import { ProjectDTO } from './types';
import {
  AVAILABLE_TIME_SLOTS,
  CommerceNotification,
  MeetingRecordDTO,
  SelectionRecord,
  StudentCommerceAPI,
  StudentOrderRecord
} from './commerceService';
import { VerificationApiError } from './verificationService';

interface StudentCommercePanelProps {
  view: 'selected' | 'meetings' | 'orders';
  accessToken?: string;
  studentId?: string;
  studentEmail?: string;
  studentName?: string;
  projects: ProjectDTO[];
  viewedProjectIds?: string[];
  selectedProjectIds?: string[];
  onSelectionChange?: (projectIds: string[]) => void;
  onToggleSelection?: (projectId: string) => Promise<void>;
  onSessionExpired: () => void;
  onLogin: () => void;
  onNavigate?: (tab: string) => void;
  onProceedToBuy?: (projectId: string) => void;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onMeetingsLoaded?: (meetings: MeetingRecordDTO[]) => void;
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
  selectedProjectIds = [],
  onSelectionChange,
  onToggleSelection,
  onSessionExpired,
  onLogin,
  onNavigate,
  onProceedToBuy,
  onToast,
  onMeetingsLoaded
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
          StudentCommerceAPI.listMeetings(accessToken, { studentId, studentEmail }),
          StudentCommerceAPI.listSelections(accessToken, studentId),
          StudentCommerceAPI.listNotifications(accessToken)
        ]);
        setMeetings(currentMeetings);
        onMeetingsLoaded?.(currentMeetings);
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
  }, [accessToken, studentIdentifier, studentId, studentEmail, onSelectionChange, onSessionExpired, onMeetingsLoaded, view]);

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
      (m) => !['CANCELLED', 'REJECTED', 'DECLINED'].includes(m.status?.toUpperCase() || '')
    ).length;
    if (activeMeetingsCount >= 3) {
      const limitMsg = 'Maximum limit reached: You can have at most 3 active guidance meetings.';
      setRequestMessage(limitMsg);
      onToast?.(limitMsg, 'error');
      return;
    }

    const values = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const projectId = String(values.get('project_id') || '').trim();
    const date = String(values.get('date') || '').trim();
    const slot = String(values.get('slot') || values.get('time') || '').trim();
    if (!projectId || !date || !slot) {
      const chooseMsg = 'Choose a project, session date, and 5-minute time slot.';
      setRequestMessage(chooseMsg);
      onToast?.(chooseMsg, 'error');
      return;
    }

    const selectedProj = projects.find((p) => String(p.id) === String(projectId));
    const projectTitle = selectedProj?.title || `Project #${projectId}`;

    setSubmitting(true);
    setRequestMessage('');
    try {
      await StudentCommerceAPI.createMeeting({
        student_id: String(studentId || studentEmail || 'student'),
        student_name: studentName || 'Verified Student',
        student_email: studentEmail || '',
        project_id: String(projectId),
        project_title: projectTitle,
        requested_date: date,
        time_slot: slot,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
      });
      const successMsg = '5-Minute Guidance Meeting requested successfully! Admin will assign Google Meet link shortly.';
      setRequestMessage(successMsg);
      onToast?.(successMsg, 'success');
      await refresh();
      form.reset();
    } catch (requestError: any) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        const errMsg = requestError instanceof Error ? requestError.message : 'Unable to request the meeting.';
        setRequestMessage(errMsg);
        onToast?.(errMsg, 'error');
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
      ) : view === 'selected' ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Selected Projects
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Your shortlisted engineering projects (up to 3). Schedule a 1-on-1 guidance meeting or proceed directly to checkout.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-900">
                {projects.filter((p) => (selectedProjectIds && selectedProjectIds.includes(p.id)) || selections.some((s) => String(s.project_id) === String(p.id))).length} / 3 Selected
              </span>
              <button
                type="button"
                onClick={() => { setLoading(true); void refresh(); }}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
                aria-label="Refresh selections"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {projects.filter((p) => (selectedProjectIds && selectedProjectIds.includes(p.id)) || selections.some((s) => String(s.project_id) === String(p.id))).length === 0 ? (
            <div className="py-14 text-center border border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50 space-y-3 mt-4">
              <FolderKanban className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-base font-bold text-slate-800">No Projects Selected Yet (0/3)</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Explore the engineering project catalogue and select up to 3 projects to schedule guidance meetings or proceed with purchase.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.('explore')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                Explore Projects
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects
                .filter((p) => (selectedProjectIds && selectedProjectIds.includes(p.id)) || selections.some((s) => String(s.project_id) === String(p.id)))
                .map((project) => {
                  const associatedMeeting = meetings.find((meeting) => String(meeting.project_id) === String(project.id));
                  const techList = project.technologies || [];
                  return (
                    <article
                      key={project.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs hover:border-indigo-200 hover:shadow-md transition-all"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            {project.projectCode || `PRJ-${project.id}`}
                          </span>
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                            {project.category}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                            {project.title}
                          </h3>
                          {project.shortDescription && (
                            <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                              {project.shortDescription}
                            </p>
                          )}
                        </div>

                        {Array.isArray(techList) && techList.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {techList.slice(0, 3).map((tech) => (
                              <span key={tech} className="text-[10px] font-medium bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {tech}
                              </span>
                            ))}
                            {techList.length > 3 && (
                              <span className="text-[10px] font-medium text-slate-400">
                                +{techList.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="text-slate-500 font-medium">Price:</span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            ₹{Number(project.price).toLocaleString('en-IN')}
                          </span>
                        </div>

                        {associatedMeeting && (
                          <div className="text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200 text-slate-600">
                            Meeting: <strong className="text-slate-800">{meetingLabel(associatedMeeting.status)}</strong>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 space-y-2 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('schedule-meet')}
                            className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs"
                          >
                            <CalendarDays className="w-3.5 h-3.5" /> Book 5-Min Meet &rarr;
                          </button>
                          <button
                            type="button"
                            onClick={() => onProceedToBuy?.(project.id)}
                            className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs"
                          >
                            Proceed to Buy
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            await onToggleSelection?.(project.id);
                            await refresh();
                          }}
                          className="w-full py-1.5 text-center text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </article>
      ) : (
        <>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  5-Minute Guidance Meetings
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
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
                  aria-label="Refresh meetings"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Meeting Booking Form (Exclusively for 5-Min Meet Page & Profile's Meeting Dashboard) */}
            <div className="mt-6 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-indigo-100 p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/70 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    <span>Request 5-Minute Guidance Meeting</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Pick a project, session date, and 5-min slot to clarify project doubts 1-on-1 on Google Meet.
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-800">
                  {activeMeetings.length} / 3 Active Meetings
                </span>
              </div>

              <form onSubmit={submitMeeting} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Select Project <span className="text-rose-500">*</span>
                    <select
                      name="project_id"
                      required
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
                    >
                      <option value="">-- Choose Project --</option>
                      {selections.length > 0 && (
                        <optgroup label="Your Selected Projects">
                          {selections.map((sel) => {
                            const proj = projects.find((p) => String(p.id) === String(sel.project_id));
                            return (
                              <option key={sel.id} value={sel.project_id}>
                                {proj?.title || `Project #${sel.project_id}`}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label={selections.length > 0 ? "Other Available Projects" : "Available Projects"}>
                        {projects
                          .filter((p) => !selections.some((s) => String(s.project_id) === String(p.id)))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Session Date <span className="text-rose-500">*</span>
                    <input
                      name="date"
                      type="date"
                      min={minimumMeetingDate}
                      required
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    5-Min Time Slot <span className="text-rose-500">*</span>
                    <select
                      name="slot"
                      required
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
                    >
                      {AVAILABLE_TIME_SLOTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    Sessions are strictly 5 minutes. Maximum 3 active guidance meetings allowed.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || activeMeetings.length >= 3}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20"
                  >
                    {submitting ? <LoaderCircle size={15} className="animate-spin" /> : <CalendarDays size={15} />}
                    <span>Request 5-Min Meet</span>
                  </button>
                </div>
              </form>

              {requestMessage && (
                <p role="status" className="mt-3 rounded-xl bg-white p-3 text-xs font-semibold text-indigo-900 border border-indigo-200 shadow-2xs">
                  {requestMessage}
                </p>
              )}
            </div>

            {/* Current Scheduled & Requested Meetings List */}
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Current Scheduled &amp; Requested Meetings
                </h3>
                <span className="text-xs text-slate-500 font-medium">{meetings.length} record{meetings.length === 1 ? '' : 's'}</span>
              </div>

              {meetings.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 space-y-2 border border-dashed border-slate-200 rounded-2xl p-6">
                  <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="font-semibold text-slate-700">No guidance meetings scheduled or requested yet.</p>
                  <p className="text-xs text-slate-400">Select a project above, choose your session date &amp; 5-min slot, and click "Request 5-Min Meet".</p>
                </div>
              ) : (
                meetings.map((meeting) => {
                  const isScheduled = meeting.status === 'SCHEDULED' || meeting.status === 'APPROVED';
                  const isPending = meeting.status === 'PENDING' || meeting.status === 'REQUESTED';

                  return (
                    <article
                      key={meeting.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 shadow-sm space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-slate-500">Meeting #{meeting.id}</span>
                            {isScheduled ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                                <CheckCircle2 size={12} /> Scheduled
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                <Clock size={12} /> Pending Admin Confirmation
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                                {meetingLabel(meeting.status)}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-extrabold text-slate-900">{meeting.project_title}</h4>
                        </div>

                        <div className="text-right text-xs bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
                          <div className="text-slate-600">
                            Scheduled Date: <strong className="text-slate-900 font-bold">{meeting.requested_date || (meeting.start_time ? new Date(meeting.start_time).toLocaleDateString('en-IN') : 'TBD')}</strong>
                          </div>
                          <div className="text-slate-600 mt-0.5">
                            Scheduled 5-Min Slot: <strong className="text-indigo-600 font-bold">{meeting.time_slot || (meeting.start_time ? new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '5-Min Slot')}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Scheduled Meeting with Google Meet URL & Waiting Notice */}
                      {isScheduled && meeting.google_meet_url ? (
                        <div className="space-y-3 pt-1">
                          {/* 10-Minute Waiting Policy Notice Box */}
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 font-medium flex items-start gap-2.5 shadow-2xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              <strong className="font-bold text-amber-950">Important:</strong> Please join on time. Once the meeting link is provided/started, the maximum waiting time is 10 minutes.
                            </p>
                          </div>

                          {/* Meet Link Display & Prominent Join Button */}
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
                            <div className="min-w-0 flex-1">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Google Meet URL</span>
                              <a
                                href={meeting.google_meet_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono font-bold text-indigo-600 hover:text-indigo-800 underline truncate block mt-0.5"
                              >
                                {meeting.google_meet_url}
                              </a>
                            </div>
                            <a
                              href={meeting.google_meet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 shadow-md shadow-emerald-600/20 transition-all shrink-0"
                            >
                              <span>Join 5-Min Google Meet</span>
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-center gap-2.5">
                          <Clock size={16} className="text-amber-600 shrink-0" />
                          <span>
                            {isPending
                              ? 'Your meeting request has been submitted. Admin will review the schedule and assign your Google Meet link shortly.'
                              : `Session status: ${meeting.status.toLowerCase()}`}
                          </span>
                        </div>
                      )}
                    </article>
                  );
                })
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
