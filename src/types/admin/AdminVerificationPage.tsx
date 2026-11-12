import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  LoaderCircle,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import {
  AdminVerificationAPI,
  VerificationApiError,
  VerificationQueue,
  VerificationQueueItem
} from '../verificationService';
import { supabase } from '../../utils/supabase/client';

interface AdminVerificationPageProps {
  accessToken: string;
  onSessionExpired: () => void;
  onChanged: () => void;
}

const emptyQueue: VerificationQueue = {
  items: [],
  total: 0,
  pending_count: 0,
  page: 1,
  page_size: 25
};

function statusStyle(status: VerificationQueueItem['status']) {
  if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function AdminVerificationPage({
  accessToken,
  onSessionExpired,
  onChanged
}: AdminVerificationPageProps) {
  const [queue, setQueue] = useState<VerificationQueue>(emptyQueue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [notice, setNotice] = useState('');

  const fetchQueue = useCallback(
    () => AdminVerificationAPI.list(accessToken, { search: search.trim(), status: filter, page }),
    [accessToken, filter, page, search]
  );

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setQueue(await fetchQueue());
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to load verification submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetchQueue()
      .then((result) => {
        if (active) {
          setQueue(result);
          setError('');
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
        } else {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load verification submissions.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchQueue, onSessionExpired]);

  // Real-time Supabase subscription for verification submissions
  useEffect(() => {
    const channel = supabase
      .channel('admin-verifications-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'verifications' },
        () => {
          void refresh();
          onChanged();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, onChanged]);

  useEffect(() => {
    if (!selected) return;

    let active = true;
    let objectUrl = '';
    void AdminVerificationAPI.getDocument(accessToken, selected.id)
      .then((blob) => {
        if (!active) return;
        if (!['image/jpeg', 'image/png', 'application/pdf', 'image/svg+xml'].includes(blob.type)) {
          setDocumentError('This document format cannot be previewed safely.');
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setDocumentType(blob.type);
        setDocumentUrl(objectUrl);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
        } else {
          setDocumentError(requestError instanceof Error ? requestError.message : 'Unable to load this document.');
        }
      })
      .finally(() => {
        if (active) setDocumentLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, onSessionExpired, selected]);

  const submitDecision = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selected) return;
    const status = rejectOpen ? 'REJECTED' : 'APPROVED';
    const reason = rejectionReason.trim();
    if (status === 'REJECTED' && reason.length < 5) {
      setDecisionError('Enter a rejection reason of at least 5 characters.');
      return;
    }
    setSavingDecision(true);
    setDecisionError('');
    try {
      await AdminVerificationAPI.decide(accessToken, selected.id, status, reason || undefined);
      setNotice(status === 'APPROVED' ? 'Student verification approved.' : 'Student verification rejected.');
      setSelected(null);
      setConfirmApproval(false);
      setRejectOpen(false);
      setRejectionReason('');
      await refresh();
      onChanged();
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setDecisionError(requestError instanceof Error ? requestError.message : 'Unable to save the decision.');
    } finally {
      setSavingDecision(false);
    }
  };

  const startSearch = (value: string) => {
    setLoading(true);
    setPage(1);
    setSearch(value);
  };

  const totalPages = Math.max(1, Math.ceil(queue.total / queue.page_size));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Student ID Verification</h2>
          <p className="mt-1 text-sm text-slate-500">Review private student documents and record decisions.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RotateCcw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <article className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div>
          <p className="text-xs font-semibold text-amber-800">Pending verifications</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{queue.pending_count}</p>
        </div>
        <span className="rounded-lg bg-white p-2.5 text-amber-700"><FileImage size={19} /></span>
      </article>

      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span><button type="button" onClick={() => void refresh()} className="font-semibold underline">Retry</button></div>}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_200px]">
        <label className="relative">
          <span className="sr-only">Search students</span>
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => startSearch(event.target.value)} placeholder="Search name, student ID, email, or phone"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <select aria-label="Filter by verification status" value={filter}
          onChange={(event) => { setLoading(true); setPage(1); setFilter(event.target.value); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading verifications">
            {[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : queue.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CheckCircle2 size={28} className="mx-auto text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-800">No verification submissions found</h3>
            <p className="mt-1 text-sm text-slate-500">Try another status filter or search term.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>{['Student Name', 'Student ID', 'Email', 'Phone Number', 'College / University', 'Submitted Date', 'Status', 'Action'].map((column) => <th key={column} className="border-b border-slate-200 px-3 py-3 font-semibold">{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.items.map((item) => (
                  <tr key={item.id} className="text-slate-700">
                    <td className="px-3 py-3 font-semibold text-slate-900">{item.student_name}</td>
                    <td className="px-3 py-3 font-mono">{item.user_id}</td>
                    <td className="px-3 py-3">{item.email || '—'}</td>
                    <td className="px-3 py-3">{item.phone || '—'}</td>
                    <td className="px-3 py-3">{item.college || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(item.submitted_at)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${statusStyle(item.status)}`}>{item.status}</span></td>
                    <td className="px-3 py-3"><button type="button" onClick={() => { setDocumentUrl(''); setDocumentType(''); setDocumentError(''); setDocumentLoading(true); setSelected(item); }} className="rounded-md bg-indigo-50 px-3 py-2 font-semibold text-indigo-700 hover:bg-indigo-100">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {queue.total > queue.page_size && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of {totalPages} · {queue.total} submissions</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="verification-detail-title" className="my-auto flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
              <div>
                <h3 id="verification-detail-title" className="text-lg font-bold text-slate-900">{selected.student_name}</h3>
                <p className="mt-1 text-xs text-slate-500">Student ID {selected.user_id} · Submitted {formatDate(selected.submitted_at)}</p>
              </div>
              <button type="button" onClick={() => { setSelected(null); setDocumentUrl(''); setDocumentType(''); setDocumentError(''); setDocumentLoading(false); setZoom(1); setRotation(0); }} aria-label="Close verification details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[300px_1fr]">
              <div className="space-y-3 border-b border-slate-200 p-4 text-xs lg:border-b-0 lg:border-r sm:p-5">
                {[
                  ['Student Name', selected.student_name || '—'],
                  ['Student ID', String(selected.user_id)],
                  ['Email', selected.email || '—'],
                  ['Phone', selected.phone || '—'],
                  ['College / University', selected.college || '—'],
                  ['Course / Department', selected.course || '—'],
                  ['Submitted', formatDate(selected.submitted_at)],
                  ['Status', selected.status]
                ].map(([label, value]) => <div key={label}><p className="font-semibold text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-slate-900">{value}</p></div>)}
              </div>
              <div className="flex min-h-[300px] flex-col bg-slate-100 p-3 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Private student ID document</p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} title="Zoom out" className="rounded-md bg-white p-2 text-slate-600 hover:bg-slate-50"><ZoomOut size={15} /></button>
                    <button type="button" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} title="Zoom in" className="rounded-md bg-white p-2 text-slate-600 hover:bg-slate-50"><ZoomIn size={15} /></button>
                    {documentType.startsWith('image/') && <button type="button" onClick={() => setRotation((value) => value + 90)} title="Rotate image" className="rounded-md bg-white p-2 text-slate-600 hover:bg-slate-50"><RotateCcw size={15} /></button>}
                    {documentUrl && <a href={documentUrl} download={`student-id-${selected.user_id}`} className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><Download size={14} /> Download</a>}
                  </div>
                </div>
                <div className="flex min-h-[260px] flex-1 items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-white">
                  {documentLoading ? <LoaderCircle className="animate-spin text-indigo-600" size={24} /> :
                    documentError ? <p role="alert" className="max-w-sm p-5 text-center text-sm text-rose-700">{documentError}</p> :
                      documentType === 'application/pdf' && documentUrl ? <iframe title="Student ID card PDF" src={documentUrl} className="h-[65vh] w-full" /> :
                        documentType.startsWith('image/') && documentUrl ? <img src={documentUrl} alt="Uploaded student ID card" className="max-h-[65vh] max-w-full object-contain transition-transform" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }} /> :
                          !documentUrl && !documentLoading ? <p className="p-5 text-center text-sm text-slate-500">Document preview is unavailable.</p> : null}
                </div>
              </div>
            </div>
            {selected.status === 'PENDING' && (
              <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 sm:px-6">
                <button type="button" onClick={() => { setDecisionError(''); setRejectOpen(true); }} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                <button type="button" onClick={() => { setDecisionError(''); setConfirmApproval(true); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Approve</button>
              </footer>
            )}
          </section>
        </div>
      )}

      {confirmApproval && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="approve-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="approve-title" className="text-lg font-bold text-slate-900">Approve student verification?</h3>
            <p className="mt-2 text-sm text-slate-600">This confirms the submitted student ID and enables eligible student preview access.</p>
            {decisionError && <p role="alert" className="mt-3 text-sm text-rose-700">{decisionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmApproval(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={savingDecision} onClick={() => void submitDecision()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingDecision ? 'Saving…' : 'Confirm Approval'}</button>
            </div>
          </section>
        </div>
      )}

      {rejectOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={submitDecision} role="dialog" aria-modal="true" aria-labelledby="reject-title" className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="reject-title" className="text-lg font-bold text-slate-900">Reject verification</h3>
            <p className="text-sm text-slate-600">Provide a clear reason so the student can submit a corrected document.</p>
            <label className="block text-xs font-semibold text-slate-700">Rejection reason
              <textarea required minLength={5} maxLength={1000} rows={4} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal" />
            </label>
            {decisionError && <p role="alert" className="text-sm text-rose-700">{decisionError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="submit" disabled={savingDecision} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingDecision ? 'Saving…' : 'Confirm Rejection'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
