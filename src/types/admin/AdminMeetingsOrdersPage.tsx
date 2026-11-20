import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
  XCircle,
  ZoomIn
} from 'lucide-react';
import {
  AdminCommerceAPI,
  AdminOrderRecord,
  AVAILABLE_TIME_SLOTS,
  CommercePage,
  MeetingRecordDTO
} from '../commerceService';
import { VerificationApiError } from '../verificationService';

interface AdminMeetingsOrdersPageProps {
  accessToken: string;
  onSessionExpired: () => void;
  onChanged: () => void;
}

type Tab = 'orders' | 'meetings';

const emptyPage = <T,>(): CommercePage<T> => ({ items: [], total: 0, page: 1, page_size: 25 });

function niceStatus(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function meetingStatusClass(status: string) {
  if (status === 'SCHEDULED' || status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200';
  if (status === 'COMPLETED') return 'bg-blue-50 text-blue-700 ring-blue-200 border-blue-200';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'bg-rose-50 text-rose-700 ring-rose-200 border-rose-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200 border-amber-200';
}

function isGoogleMeetUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'meet.google.com' &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.pathname === '/new' ||
        /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname) ||
        /^\/lookup\/[A-Za-z0-9_-]+$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export default function AdminMeetingsOrdersPage({
  accessToken,
  onSessionExpired,
  onChanged
}: AdminMeetingsOrdersPageProps) {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<CommercePage<AdminOrderRecord>>(emptyPage);
  const [meetings, setMeetings] = useState<CommercePage<MeetingRecordDTO>>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  const [meetingFilter, setMeetingFilter] = useState('');
  const [page, setPage] = useState(1);

  // Meeting Approval Modal State
  const [approvalMeeting, setApprovalMeeting] = useState<MeetingRecordDTO | null>(null);
  const [meetUrl, setMeetUrl] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState('');
  const [modalError, setModalError] = useState('');
  const [savingMeeting, setSavingMeeting] = useState(false);

  // Order Inspection & Verification Modal State
  const [inspectingOrder, setInspectingOrder] = useState<AdminOrderRecord | null>(null);
  const [deliverableLink, setDeliverableLink] = useState('');
  const [verifyingOrder, setVerifyingOrder] = useState(false);
  const [orderModalError, setOrderModalError] = useState('');
  const [fullscreenScreenshot, setFullscreenScreenshot] = useState<string | null>(null);
  const [copiedUtr, setCopiedUtr] = useState(false);

  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'orders') {
        const result = await AdminCommerceAPI.listOrders(accessToken, {
          search: search.trim(),
          paymentStatus: paymentFilter,
          orderStatus: orderFilter,
          page
        });
        setOrders(result);
      } else {
        const result = await AdminCommerceAPI.listMeetings(accessToken, {
          search: search.trim(),
          status: meetingFilter,
          page
        });
        setMeetings(result);
      }
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to load records.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, meetingFilter, onSessionExpired, orderFilter, page, paymentFilter, search, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const changeFilter = (callback: () => void) => {
    setLoading(true);
    setPage(1);
    callback();
  };

  // Open meeting approval & reschedule modal
  const openMeetingModal = (meeting: MeetingRecordDTO) => {
    setApprovalMeeting(meeting);
    setMeetUrl(meeting.google_meet_url || '');
    setModalError('');
    setScheduledDate(meeting.requested_date || (meeting.start_time ? meeting.start_time.slice(0, 10) : new Date().toISOString().slice(0, 10)));
    setScheduledTimeSlot(meeting.time_slot || '10:00 AM - 10:05 AM');
  };

  // Schedule / Modify & Save Google Meet Link
  const handleApproveMeeting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!approvalMeeting) return;
    if (!isGoogleMeetUrl(meetUrl.trim())) {
      setModalError('Enter a valid HTTPS Google Meet link (e.g. https://meet.google.com/abc-defg-hij).');
      return;
    }
    setSavingMeeting(true);
    setModalError('');
    try {
      let startIso: string | undefined;
      let endIso: string | undefined;
      if (scheduledDate && scheduledTimeSlot) {
        try {
          const match = scheduledTimeSlot.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (match) {
            let hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const meridian = match[3].toUpperCase();
            if (meridian === 'PM' && hours < 12) hours += 12;
            if (meridian === 'AM' && hours === 12) hours = 0;
            const s = new Date(`${scheduledDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
            const e = new Date(s.getTime() + 5 * 60_000);
            startIso = s.toISOString();
            endIso = e.toISOString();
          }
        } catch { /* fallback */ }
      }

      await AdminCommerceAPI.approveMeeting(accessToken, approvalMeeting.id, meetUrl.trim(), {
        start_time: startIso,
        end_time: endIso,
        requested_date: scheduledDate,
        time_slot: scheduledTimeSlot
      });

      setApprovalMeeting(null);
      setMeetUrl('');
      setNotice(`Meeting #${approvalMeeting.id} updated! Google Meet link saved and shared with student.`);
      await refresh();
      onChanged();
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'Unable to save and share meeting link.');
    } finally {
      setSavingMeeting(false);
    }
  };

  // Open order inspection modal
  const openOrderInspection = (order: AdminOrderRecord) => {
    setInspectingOrder(order);
    setDeliverableLink(order.deliverable_url || '');
    setOrderModalError('');
    setCopiedUtr(false);
  };

  // Approve order & deliver ZIP
  const handleApproveOrder = async () => {
    if (!inspectingOrder) return;
    setVerifyingOrder(true);
    setOrderModalError('');
    try {
      const res = await AdminCommerceAPI.verifyOrder(
        accessToken,
        inspectingOrder.id,
        'APPROVE',
        deliverableLink.trim()
      );

      const rewardNote = res.referralRewarded
        ? ` (20% referral reward of ₹${res.rewardAmount} credited to inviter)`
        : '';

      setNotice(`Order #${inspectingOrder.id} approved and marked PAID! Deliverables link attached${rewardNote}.`);
      setInspectingOrder(null);
      await refresh();
      onChanged();
    } catch (err: any) {
      setOrderModalError(err?.message || 'Failed to approve order.');
    } finally {
      setVerifyingOrder(false);
    }
  };

  // Reject order
  const handleRejectOrder = async () => {
    if (!inspectingOrder) return;
    setVerifyingOrder(true);
    setOrderModalError('');
    try {
      await AdminCommerceAPI.verifyOrder(accessToken, inspectingOrder.id, 'REJECT');
      setNotice(`Order #${inspectingOrder.id} rejected.`);
      setInspectingOrder(null);
      await refresh();
      onChanged();
    } catch (err: any) {
      setOrderModalError(err?.message || 'Failed to reject order.');
    } finally {
      setVerifyingOrder(false);
    }
  };

  const copyUtrToClipboard = (utr: string) => {
    void navigator.clipboard.writeText(utr);
    setCopiedUtr(true);
    setTimeout(() => setCopiedUtr(false), 2000);
  };

  const pageData = tab === 'orders' ? orders : meetings;
  const totalPages = Math.max(1, Math.ceil(pageData.total / pageData.page_size));

  return (
    <section className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice('')} className="p-1 text-emerald-700 hover:text-emerald-900">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => void refresh()} className="underline hover:text-rose-950 font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 flex-wrap">
        <div className="flex gap-2">
          {[
            ['orders', 'Student Orders & UTR Payments', ShoppingBag],
            ['meetings', '5-Min Guidance Meetings', CalendarDays]
          ].map(([key, label, Icon]: any) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key as Tab);
                setPage(1);
                setSearch('');
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all ${
                tab === key
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
          <span>Refresh Table</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && changeFilter(() => void refresh())}
            placeholder={tab === 'orders' ? 'Search by Student Name, UTR, Invoice, Project…' : 'Search by Student Name, Project, Email…'}
            className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>

        {tab === 'orders' ? (
          <>
            <select
              value={paymentFilter}
              onChange={(e) => changeFilter(() => setPaymentFilter(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="">All Payment Statuses</option>
              <option value="AWAITING_VERIFICATION">Awaiting UTR Verification</option>
              <option value="PAID">Paid &amp; Approved</option>
              <option value="REJECTED">Payment Rejected</option>
            </select>

            <select
              value={orderFilter}
              onChange={(e) => changeFilter(() => setOrderFilter(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="">All Order Statuses</option>
              <option value="PENDING">Pending Delivery</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </>
        ) : (
          <select
            value={meetingFilter}
            onChange={(e) => changeFilter(() => setMeetingFilter(e.target.value))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="">All Meeting Statuses</option>
            <option value="PENDING">Pending Scheduling</option>
            <option value="SCHEDULED">Scheduled (Link Attached)</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : pageData.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            {tab === 'orders' ? (
              <ShoppingBag size={32} className="mx-auto text-slate-300" />
            ) : (
              <CalendarDays size={32} className="mx-auto text-slate-300" />
            )}
            <p className="mt-3 text-sm font-bold text-slate-800">No {tab} found</p>
            <p className="mt-1 text-xs text-slate-500">
              {tab === 'orders' ? 'Incoming student orders and UTR payments will show up here.' : 'Student 5-minute meeting requests will appear here.'}
            </p>
          </div>
        ) : tab === 'orders' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  {['Order ID & Invoice', 'Student Name', 'Student ID', 'Project Title', 'Order Date', 'Amount', 'Payment Status', 'Deliverable ZIP', 'Action'].map((head) => (
                    <th key={head} className="border-b border-slate-200 px-3.5 py-3 font-bold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.items.map((order) => {
                  const isAwaiting = order.payment_status === 'AWAITING_VERIFICATION' || order.payment_status === 'PENDING';
                  return (
                    <tr key={order.id} className="text-slate-700 hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-3">
                        <div className="font-mono font-bold text-slate-900">#{order.id}</div>
                        <div className="text-[10px] font-mono text-slate-400">{order.invoice_number || 'INV-2026-' + order.id}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-slate-900">{order.student_name}</div>
                        {order.student_email && <div className="text-[10px] text-slate-400">{order.student_email}</div>}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-medium">{order.student_id || order.user_id}</td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900">{order.project_title}</td>
                      <td className="whitespace-nowrap px-3.5 py-3 font-medium text-slate-500">
                        {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 font-black text-slate-900">
                        ₹{order.amount.toFixed(2)}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          order.payment_status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : order.payment_status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 animate-pulse'
                        }`}>
                          {isAwaiting && <Clock size={10} />}
                          {niceStatus(order.payment_status)}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 max-w-[180px] truncate">
                        {order.deliverable_url ? (
                          <a
                            href={order.deliverable_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 underline hover:text-indigo-800"
                          >
                            <ExternalLink size={12} /> Deliverable Link
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Not attached</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openOrderInspection(order)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                            isAwaiting
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <ShieldCheck size={14} />
                          <span>Inspect &amp; Verify</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  {['Meeting ID', 'Student Name', 'Email', 'Project Title', 'Requested Date', 'Requested Time Slot', 'Status', 'Google Meet Link', 'Action'].map((head) => (
                    <th key={head} className="border-b border-slate-200 px-3.5 py-3 font-bold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {meetings.items.map((meeting) => {
                  const isPending = ['PENDING', 'REQUESTED', 'RESCHEDULE_REQUESTED', 'Request Submitted'].includes(meeting.status);
                  const isScheduled = meeting.status === 'SCHEDULED' || meeting.status === 'APPROVED';

                  return (
                    <tr key={meeting.id} className="text-slate-700 hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900">#{meeting.id}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-slate-900">{meeting.student_name || 'Student'}</div>
                        <div className="text-[10px] font-mono text-slate-400">ID: {meeting.student_id}</div>
                      </td>
                      <td className="px-3.5 py-3 font-medium text-slate-600">
                        {meeting.student_email || '—'}
                      </td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900 max-w-xs">{meeting.project_title}</td>
                      <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                        {meeting.requested_date || (meeting.start_time ? new Date(meeting.start_time).toLocaleDateString('en-IN') : 'TBD')}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 font-mono font-bold text-indigo-700">
                        {meeting.time_slot || (meeting.start_time ? new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '5-Min Slot')}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold border ${meetingStatusClass(meeting.status)}`}>
                          {isPending && <Clock size={10} />}
                          {isScheduled ? 'Scheduled' : isPending ? 'Pending Admin Confirmation' : niceStatus(meeting.status)}
                        </span>
                      </td>
                      <td className="max-w-48 truncate px-3.5 py-3">
                        {isScheduled && meeting.google_meet_url ? (
                          <a
                            href={meeting.google_meet_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 underline hover:text-indigo-900"
                          >
                            <ExternalLink size={12} /> Join Meet
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Not scheduled</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openMeetingModal(meeting)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-2xs ${
                            isPending
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Schedule / Modify &amp; Add Meet Link
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {pageData.total > pageData.page_size && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>Page {page} of {totalPages} · {pageData.total} total records</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((val) => val - 1);
              }}
              className="rounded-xl border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setLoading(true);
                setPage((val) => val + 1);
              }}
              className="rounded-xl border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Schedule / Modify & Add Meet Link */}
      {approvalMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleApproveMeeting}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Guidance Session Schedule</span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">Schedule / Modify &amp; Add Meet Link</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Meeting #{approvalMeeting.id} · <span className="font-semibold text-slate-700">{approvalMeeting.student_name || 'Student'}</span> ({approvalMeeting.student_email || 'No email'}) · <span className="font-semibold text-slate-700">{approvalMeeting.project_title}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApprovalMeeting(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            {/* Session Date & 5-Min Time Slot Modification */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Session Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  5-Min Time Slot <span className="text-rose-500">*</span>
                </label>
                <select
                  value={scheduledTimeSlot}
                  onChange={(e) => setScheduledTimeSlot(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-600 outline-none"
                >
                  {AVAILABLE_TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                  {scheduledTimeSlot && !AVAILABLE_TIME_SLOTS.includes(scheduledTimeSlot) && (
                    <option value={scheduledTimeSlot}>{scheduledTimeSlot}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Google Meet Link Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Google Meet Link <span className="text-rose-500">*</span>
              </label>
              <input
                autoFocus
                required
                type="url"
                value={meetUrl}
                onChange={(e) => {
                  setMeetUrl(e.target.value);
                  setModalError('');
                }}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Paste the clean Google Meet URL (e.g. <strong className="font-mono text-slate-700">https://meet.google.com/abc-defg-hij</strong>).
              </span>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <footer className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApprovalMeeting(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingMeeting}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {savingMeeting && <LoaderCircle size={15} className="animate-spin" />}
                <span>{savingMeeting ? 'Saving & Sharing…' : 'Save & Share Meet Link'}</span>
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* MODAL 2: Order UTR & Payment Proof Inspection Modal */}
      {inspectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5 rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-200">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Order Payment Verification</span>
                <h3 className="text-xl font-black text-slate-900 mt-0.5">
                  Verify Order #{inspectingOrder.id} · ₹{inspectingOrder.amount}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Invoice: <strong className="font-mono text-slate-700">{inspectingOrder.invoice_number || 'INV-2026-' + inspectingOrder.id}</strong> · {new Date(inspectingOrder.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            {/* Student & Project Details Card */}
            <div className="grid sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase">Student Information</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{inspectingOrder.student_name}</p>
                <p className="text-slate-600 font-mono text-[11px]">ID: {inspectingOrder.student_id || inspectingOrder.user_id}</p>
                {inspectingOrder.student_email && <p className="text-slate-600">{inspectingOrder.student_email}</p>}
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase">Project Deliverables</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{inspectingOrder.project_title}</p>
                <p className="text-slate-600 font-medium">Final Price: <strong className="text-emerald-700 font-extrabold">₹{inspectingOrder.amount}</strong></p>
              </div>
            </div>

            {/* Payment Verification Section: 12-digit UTR & Screenshot */}
            <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-purple-950 text-xs">
                  <ShieldCheck size={16} className="text-purple-600" />
                  <span>Bank / UPI Transaction Reference (UTR)</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-800">
                  {inspectingOrder.payment_status}
                </span>
              </div>

              {/* UTR Number Display with Copy */}
              <div className="flex items-center justify-between bg-white border border-purple-200 rounded-xl px-4 py-2.5">
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">12-Digit Transaction UTR</span>
                  <span className="font-mono text-base font-black text-slate-900 tracking-wider">
                    {inspectingOrder.utr_number || 'No UTR Number provided'}
                  </span>
                </div>
                {inspectingOrder.utr_number && (
                  <button
                    type="button"
                    onClick={() => copyUtrToClipboard(inspectingOrder.utr_number!)}
                    className="flex items-center gap-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 text-xs font-bold transition-colors"
                  >
                    <Copy size={13} />
                    <span>{copiedUtr ? 'Copied!' : 'Copy UTR'}</span>
                  </button>
                )}
              </div>

              {/* Payment Screenshot Thumbnail & Lightbox */}
              <div>
                <label className="block text-xs font-bold text-purple-950 mb-1.5">
                  Payment Confirmation Screenshot
                </label>
                {inspectingOrder.payment_screenshot_url ? (
                  <div className="relative group rounded-xl border border-purple-200 overflow-hidden bg-slate-900 max-h-64 flex items-center justify-center">
                    <img
                      src={inspectingOrder.payment_screenshot_url}
                      alt="Student Payment Screenshot"
                      className="max-h-60 w-auto object-contain cursor-pointer transition-transform group-hover:scale-102"
                      onClick={() => setFullscreenScreenshot(inspectingOrder.payment_screenshot_url || null)}
                    />
                    <button
                      type="button"
                      onClick={() => setFullscreenScreenshot(inspectingOrder.payment_screenshot_url || null)}
                      className="absolute bottom-2 right-2 flex items-center gap-1 bg-slate-900/80 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold backdrop-blur-xs"
                    >
                      <ZoomIn size={13} /> Click to Enlarge
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No payment screenshot image attached to this order.
                  </div>
                )}
              </div>
            </div>

            {/* Fulfilment Input: Project ZIP / Google Drive Deliverable Link */}
            <div className="space-y-1.5">
              <label htmlFor="deliverable-link" className="block text-xs font-bold text-slate-700">
                Project Source Code ZIP / Google Drive Link <span className="text-emerald-600 font-normal">(Fulfilment)</span>
              </label>
              <input
                id="deliverable-link"
                type="url"
                value={deliverableLink}
                onChange={(e) => setDeliverableLink(e.target.value)}
                placeholder="e.g. https://drive.google.com/drive/folders/... or https://storage.supabase.co/.../project.zip"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none"
              />
              <span className="block text-[11px] text-slate-500">
                This secure download link will instantly appear on the student's portal under <strong>"My Purchases &amp; Files"</strong> upon approval.
              </span>
            </div>

            {orderModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{orderModalError}</span>
              </div>
            )}

            {/* Actions: Approve & Deliver ZIP / Reject */}
            <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={verifyingOrder}
                onClick={handleRejectOrder}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2 text-xs font-extrabold transition-colors disabled:opacity-50"
              >
                <XCircle size={15} />
                <span>Reject Payment</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingOrder(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={verifyingOrder}
                  onClick={handleApproveOrder}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-5 py-2 text-xs font-black text-white transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {verifyingOrder ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  <span>Approve Payment &amp; Deliver ZIP</span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* FULLSCREEN PAYMENT SCREENSHOT LIGHTBOX */}
      {fullscreenScreenshot && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setFullscreenScreenshot(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setFullscreenScreenshot(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <img
              src={fullscreenScreenshot}
              alt="Payment Screenshot Lightbox"
              className="max-h-[82vh] w-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}
