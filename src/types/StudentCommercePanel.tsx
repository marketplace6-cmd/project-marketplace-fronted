import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { ProjectDTO } from './types';
import {
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
  projects: ProjectDTO[];
  viewedProjectIds?: string[];
  onSelectionChange?: (projectIds: string[]) => void;
  onToggleSelection?: (projectId: string) => Promise<void>;
  onSessionExpired: () => void;
  onLogin: () => void;
}

function paymentLabel(status: string | null) {
  return status ? status.toLowerCase().replace(/_/g, ' ') : 'Not recorded';
}

function meetingLabel(status: string) {
  return status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudentCommercePanel({
  view,
  accessToken,
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

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      if (view === 'orders') {
        setOrders(await StudentCommerceAPI.listOrders(accessToken));
      } else {
        const [currentMeetings, currentSelections, currentNotifications] = await Promise.all([
          StudentCommerceAPI.listMeetings(accessToken),
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
        setError(requestError instanceof Error ? requestError.message : 'Unable to load your records.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSelectionChange, onSessionExpired, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submitMeeting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      onLogin();
      return;
    }
    const values = new FormData(event.currentTarget);
    const form = event.currentTarget;
    const projectId = Number(values.get('project_id'));
    const date = String(values.get('date') || '');
    const time = String(values.get('time') || '');
    if (!Number.isInteger(projectId) || !date || !time) {
      setRequestMessage('Choose a selected project, date, and start time.');
      return;
    }
    const guideId = await StudentCommerceAPI.getAvailableGuide().catch((requestError: unknown) => {
      setRequestMessage(requestError instanceof Error ? requestError.message : 'Unable to check meeting availability.');
      return null;
    });
    if (guideId === null) {
      setRequestMessage((previous) => previous || 'No meeting guide is currently available.');
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 5 * 60_000);
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      setRequestMessage('Choose a future meeting time.');
      return;
    }
    setSubmitting(true);
    setRequestMessage('');
    try {
      await StudentCommerceAPI.createMeeting(accessToken, {
        project_id: projectId,
        guide_id: guideId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });
      setRequestMessage('Meeting request submitted. It will appear here after the backend confirms it.');
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

  if (!accessToken) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Sign in to view your account records</h2>
      <p className="mt-1 text-sm text-slate-600">Orders, selections, and meeting links are private to your student account.</p>
      <button type="button" onClick={onLogin} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Student sign in</button>
    </section>;
  }

  if (loading) return <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Loading {view}…</div>;

  return <section className="space-y-5">
    {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => { setLoading(true); void refresh(); }} className="font-semibold underline">Retry</button></div>}

    {view === 'orders' ? (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">My Orders</h2><button type="button" onClick={() => { setLoading(true); void refresh(); }} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="Refresh orders"><RefreshCw size={15} /></button></div>
        {orders.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No orders are recorded for this account.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{['Order ID', 'Project', 'Order Date', 'Amount', 'Payment Status', 'Order Status'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => <tr key={order.id}><td className="px-3 py-3 font-mono">#{order.id}</td><td className="px-3 py-3 font-semibold text-slate-900">{order.project_title}</td><td className="whitespace-nowrap px-3 py-3">{new Date(order.created_at).toLocaleString()}</td><td className="px-3 py-3">{order.currency} {order.amount.toFixed(2)}</td><td className="px-3 py-3">{paymentLabel(order.payment_status)}</td><td className="px-3 py-3">{paymentLabel(order.status)}</td></tr>)}</tbody></table></div>}
      </article>
    ) : (
      <>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">{view === 'selected' ? 'Selected Projects for Guidance' : 'Your Guidance Meetings'}</h2><button type="button" onClick={() => { setLoading(true); void refresh(); }} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="Refresh meetings"><RefreshCw size={15} /></button></div>

          {view === 'selected' && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.filter((project) => viewedProjectIds.includes(project.id)).map((project) => {
              const isSelected = selections.some((selection) => String(selection.project_id) === project.id);
              return <article key={project.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-mono text-[10px] text-slate-500">{project.projectCode || project.id}</p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">{project.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{meetings.find((meeting) => String(meeting.project_id) === project.id)?.status
                  ? `Meeting: ${meetingLabel(meetings.find((meeting) => String(meeting.project_id) === project.id)?.status || '')}`
                  : 'No meeting requested'}</p>
                <button type="button" onClick={async () => { await onToggleSelection?.(project.id); await refresh(); }} className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold ${isSelected ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>{isSelected ? 'Remove selection' : 'Select for guidance'}</button>
              </article>;
            })}
            {projects.filter((project) => viewedProjectIds.includes(project.id)).length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500">Preview a project before selecting it for guidance.</p>}
          </div>}

          {view === 'selected' && selections.length > 0 && <form onSubmit={submitMeeting} className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_180px_160px_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-700">Selected project
              <select name="project_id" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                {selections.map((selection) => {
                  const project = projects.find((item) => Number(item.id) === selection.project_id);
                  return <option key={selection.id} value={selection.project_id}>{project?.title || `Project #${selection.project_id}`}</option>;
                })}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">Date<input name="date" type="date" min={minimumMeetingDate} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Start time<input name="time" type="time" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" /></label>
            <button type="submit" disabled={submitting || meetings.filter((meeting) => !['CANCELLED', 'COMPLETED', 'REJECTED'].includes(meeting.status)).length >= 3} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{submitting ? <LoaderCircle size={14} className="animate-spin" /> : <CalendarDays size={14} />}Request 5-min meeting</button>
          </form>}
          {view === 'selected' && requestMessage && <p role="status" className="mt-3 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800">{requestMessage}</p>}

          {view !== 'selected' && meetings.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No meetings are recorded for this account.</p> : view !== 'selected' && <div className="mt-4 space-y-3">{meetings.map((meeting) => <article key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div><p className="font-mono text-[10px] text-slate-500">Meeting #{meeting.id}</p><h3 className="mt-1 text-sm font-bold text-slate-900">{meeting.project_title}</h3><p className="mt-1 text-xs text-slate-600">{new Date(meeting.start_time).toLocaleString()} – {new Date(meeting.end_time).toLocaleTimeString()} ({meeting.timezone})</p><p className="mt-1 text-xs text-slate-600">Status: {meetingLabel(meeting.status)}</p></div>
            {meeting.status === 'SCHEDULED' && meeting.google_meet_url && <a href={meeting.google_meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Join Google Meet <ExternalLink size={13} /></a>}
          </article>)}</div>}
          {view === 'selected' && meetings.length > 0 && <div className="mt-5 space-y-3">{meetings.map((meeting) => <article key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div><p className="font-mono text-[10px] text-slate-500">Meeting #{meeting.id}</p><h3 className="mt-1 text-sm font-bold text-slate-900">{meeting.project_title}</h3><p className="mt-1 text-xs text-slate-600">{new Date(meeting.start_time).toLocaleString()} · {meetingLabel(meeting.status)}</p></div>
            {meeting.status === 'SCHEDULED' && meeting.google_meet_url && <a href={meeting.google_meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Join Google Meet <ExternalLink size={13} /></a>}
          </article>)}</div>}
        </article>
        {view === 'meetings' && notifications.length > 0 && <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Meeting notifications</h3><ul className="mt-3 space-y-2">{notifications.slice(0, 5).map((notification) => <li key={notification.id} className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900"><p>{notification.message}</p><time className="mt-1 block text-[10px] opacity-70">{new Date(notification.created_at).toLocaleString()}</time></li>)}</ul></article>}
      </>
    )}
  </section>;
}
