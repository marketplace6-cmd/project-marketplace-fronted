import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  ShoppingBag,
  X
} from 'lucide-react';
import {
  AdminCommerceAPI,
  AdminOrderRecord,
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
  if (status === 'SCHEDULED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'COMPLETED') return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200';
}

function isGoogleMeetUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'meet.google.com'
      && (!url.port || url.port === '443')
      && !url.username
      && !url.password
      && !url.hash
      && (
        url.pathname === '/new'
        || /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)
        || /^\/lookup\/[A-Za-z0-9_-]+$/.test(url.pathname)
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
  const [approvalMeeting, setApprovalMeeting] = useState<MeetingRecordDTO | null>(null);
  const [meetUrl, setMeetUrl] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'orders') {
        setOrders(await AdminCommerceAPI.listOrders(accessToken, {
          search: search.trim(),
          paymentStatus: paymentFilter,
          orderStatus: orderFilter,
          page
        }));
      } else {
        setMeetings(await AdminCommerceAPI.listMeetings(accessToken, {
          search: search.trim(),
          status: meetingFilter,
          page
        }));
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

  const approve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!approvalMeeting) return;
    if (!isGoogleMeetUrl(meetUrl.trim())) {
      setModalError('Enter a valid HTTPS Google Meet link, such as a meet.google.com meeting link.');
      return;
    }
    setSaving(true);
    setModalError('');
    try {
      await AdminCommerceAPI.approveMeeting(accessToken, approvalMeeting.id, meetUrl.trim());
      setApprovalMeeting(null);
      setMeetUrl('');
      setNotice(`Meeting #${approvalMeeting.id} approved. No order or payment status was changed.`);
      await refresh();
      onChanged();
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setModalError(requestError instanceof Error ? requestError.message : 'Unable to approve the meeting.');
      }
    } finally {
      setSaving(false);
    }
  };

  const pageData = tab === 'orders' ? orders : meetings;
  const totalPages = Math.max(1, Math.ceil(pageData.total / pageData.page_size));

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Meetings &amp; Orders</h2>
          <p className="mt-1 text-sm text-slate-500">Review marketplace records without changing payment confirmations.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div role="tablist" aria-label="Management sections" className="flex gap-2 border-b border-slate-200">
        {([
          ['orders', 'Orders', ShoppingBag],
          ['meetings', 'Meetings', CalendarDays]
        ] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button"
            onClick={() => { setTab(id); setPage(1); setLoading(true); setError(''); setNotice(''); }}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span><button type="button" onClick={() => void refresh()} className="font-semibold underline">Retry</button></div>}

      <div className={`grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${tab === 'orders' ? 'sm:grid-cols-[1fr_180px_180px]' : 'sm:grid-cols-[1fr_200px]'}`}>
        <label className="relative">
          <span className="sr-only">Search records</span>
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => changeFilter(() => setSearch(event.target.value))} placeholder="Search ID, student, email, phone, or project" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </label>
        {tab === 'orders' ? (
          <>
            <select aria-label="Filter by payment status" value={paymentFilter} onChange={(event) => changeFilter(() => setPaymentFilter(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">All payment statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
            <select aria-label="Filter by order status" value={orderFilter} onChange={(event) => changeFilter(() => setOrderFilter(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">All order statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </>
        ) : (
          <select aria-label="Filter by meeting status" value={meetingFilter} onChange={(event) => changeFilter(() => setMeetingFilter(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All meeting statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SCHEDULED">Approved</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading records">{[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : pageData.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            {tab === 'orders' ? <ShoppingBag size={26} className="mx-auto text-slate-400" /> : <CalendarDays size={26} className="mx-auto text-slate-400" />}
            <p className="mt-3 text-sm font-semibold text-slate-800">No {tab} found</p>
            <p className="mt-1 text-xs text-slate-500">Try another search or filter.</p>
          </div>
        ) : tab === 'orders' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{['Order ID', 'Student Name', 'Student ID', 'Project Name', 'Order Date', 'Amount', 'Payment Status', 'Order Status', 'Action'].map((head) => <th key={head} className="border-b border-slate-200 px-3 py-3 font-semibold">{head}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {orders.items.map((order) => <tr key={order.id} className="text-slate-700">
                  <td className="px-3 py-3 font-mono font-semibold">#{order.id}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{order.student_name}</td>
                  <td className="px-3 py-3 font-mono">{order.user_id}</td>
                  <td className="px-3 py-3">{order.project_title}</td>
                  <td className="whitespace-nowrap px-3 py-3">{new Date(order.created_at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-3">{order.currency} {order.amount.toFixed(2)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${order.payment_status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{niceStatus(order.payment_status)}</span></td>
                  <td className="px-3 py-3">{niceStatus(order.status)}</td>
                  <td className="px-3 py-3 text-slate-400">Read only</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{['Meeting ID', 'Student Name', 'Student ID', 'Project Name', 'Booking Date', 'Meeting Status', 'Payment Status', 'Google Meet Link', 'Action'].map((head) => <th key={head} className="border-b border-slate-200 px-3 py-3 font-semibold">{head}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {meetings.items.map((meeting) => <tr key={meeting.id} className="text-slate-700">
                  <td className="px-3 py-3 font-mono font-semibold">#{meeting.id}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{meeting.student_name || 'Student'}</td>
                  <td className="px-3 py-3 font-mono">{meeting.student_id}</td>
                  <td className="px-3 py-3">{meeting.project_title}</td>
                  <td className="whitespace-nowrap px-3 py-3">{new Date(meeting.start_time).toLocaleString()} ({meeting.timezone})</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${meetingStatusClass(meeting.status)}`}>{niceStatus(meeting.status)}</span></td>
                  <td className="px-3 py-3">{niceStatus(meeting.payment_status)}</td>
                  <td className="max-w-48 truncate px-3 py-3">{meeting.status === 'SCHEDULED' && meeting.google_meet_url ? <a href={meeting.google_meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-700 underline"><ExternalLink size={12} />Open link</a> : '—'}</td>
                  <td className="px-3 py-3">{['REQUESTED', 'RESCHEDULE_REQUESTED'].includes(meeting.status)
                    ? <button type="button" onClick={() => { setMeetUrl(''); setModalError(''); setApprovalMeeting(meeting); }} className="whitespace-nowrap rounded-md bg-indigo-50 px-3 py-2 font-semibold text-indigo-700 hover:bg-indigo-100">Approve &amp; Attach Link</button>
                    : <span className="text-slate-400">—</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pageData.total > pageData.page_size && <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Page {page} of {totalPages} · {pageData.total} records</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronLeft size={15} /></button>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronRight size={15} /></button>
        </div>
      </div>}

      {approvalMeeting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
        <form onSubmit={approve} role="dialog" aria-modal="true" aria-labelledby="approve-meeting-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
          <header className="flex items-start justify-between gap-3">
            <div><h3 id="approve-meeting-title" className="text-lg font-bold text-slate-900">Approve &amp; attach Google Meet link</h3><p className="mt-1 text-xs text-slate-500">Meeting #{approvalMeeting.id} · {approvalMeeting.student_name || 'Student'} · {approvalMeeting.project_title}</p></div>
            <button type="button" aria-label="Close dialog" onClick={() => setApprovalMeeting(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={17} /></button>
          </header>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{new Date(approvalMeeting.start_time).toLocaleString()} – {new Date(approvalMeeting.end_time).toLocaleTimeString()} ({approvalMeeting.timezone})</div>
          <label className="block text-xs font-semibold text-slate-700">Google Meet URL
            <input autoFocus required type="url" value={meetUrl} onChange={(event) => setMeetUrl(event.target.value)} placeholder="https://meet.google.com/abc-defg-hij" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
            <span className="mt-1 block font-normal text-slate-500">Only HTTPS links on meet.google.com are accepted.</span>
          </label>
          <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Approving a meeting does not confirm or change any order or payment.</p>
          {modalError && <p role="alert" className="text-sm text-rose-700">{modalError}</p>}
          <footer className="flex justify-end gap-2">
            <button type="button" onClick={() => setApprovalMeeting(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? 'Saving…' : 'Done'}</button>
          </footer>
        </form>
      </div>}
    </section>
  );
}
