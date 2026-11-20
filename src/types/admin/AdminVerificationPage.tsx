import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileImage,
  LoaderCircle,
  RotateCcw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Eye,
  ShieldCheck,
  XCircle,
  Sparkles
} from 'lucide-react';
import {
  AdminVerificationAPI,
  VerificationApiError,
  VerificationQueue,
  VerificationQueueItem,
  sortVerificationItems
} from '../verificationService';
import { SAMPLE_STUDENT_ID_FRONT, SAMPLE_STUDENT_ID_BACK } from '../mockIdCards';
import { supabase } from '../../utils/supabase/client';
import UnikartLoader from '../UnikartLoader';

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

const REJECTION_PRESETS = [
  'Blurry or illegible student ID photo',
  'Expired college ID document',
  'Student name does not match ID document',
  'Missing official college validation seal',
  'Payment proof UTR transaction reference invalid'
];

function statusStyle(status: VerificationQueueItem['status']) {
  if (status === 'RE-UPLOADED') return 'bg-violet-100 text-violet-900 ring-violet-400 border-violet-400 font-black';
  if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200';
  if (status === 'BLOCKED') return 'bg-purple-50 text-purple-700 ring-purple-200 border-purple-200';
  if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 ring-rose-200 border-rose-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200 border-amber-200';
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
}

function DocumentThumbnail({
  item,
  onClick
}: {
  item: VerificationQueueItem;
  onClick: () => void;
}) {
  const docType = (item.document_type || item.document_name || '').toLowerCase();
  const isPayment = docType.includes('payment') || docType.includes('receipt') || docType.includes('upi');
  const isProject = docType.includes('project') || docType.includes('preview') || docType.includes('architecture');
  
  const realImageSrc =
    (item.front_data_url && item.front_data_url.startsWith('data:image/'))
      ? item.front_data_url
      : (item.front_image_url && !item.front_image_url.endsWith('.svg'))
      ? item.front_image_url
      : (item.document_name && (item.document_name.startsWith('data:image/') || item.document_name.startsWith('/uploads')))
      ? item.document_name
      : SAMPLE_STUDENT_ID_FRONT;
  const isRealImage = Boolean(realImageSrc);
  const displayDocName = (item.document_name && !item.document_name.includes('document_upload.png') && !item.document_name.startsWith('data:'))
    ? item.document_name
    : 'Front ID Card';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 hover:border-indigo-400 hover:bg-indigo-50/40 hover:shadow-xs transition-all text-left w-full max-w-[260px]"
      title="Click to view full image lightbox & student credentials"
    >
      <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 shrink-0 flex items-center justify-center shadow-xs">
        {isRealImage ? (
          <img
            src={realImageSrc!}
            alt={item.student_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : isPayment ? (
          <div className="w-full h-full bg-emerald-950 p-1 flex flex-col justify-between text-[7px] text-white font-mono">
            <div className="bg-emerald-600 px-1 py-0.5 rounded text-[6px] font-bold text-center">UPI RECEIPT</div>
            <div className="text-emerald-300 font-extrabold text-center">₹1,500</div>
          </div>
        ) : isProject ? (
          <div className="w-full h-full bg-indigo-950 p-1 flex flex-col justify-between text-[7px] text-white font-mono">
            <div className="bg-indigo-600 px-1 py-0.5 rounded text-[6px] font-bold text-center">BLUEPRINT</div>
            <div className="text-indigo-200 text-center font-bold">PREVIEW</div>
          </div>
        ) : (
          <div className="w-full h-full bg-blue-950 p-1 flex flex-col justify-between text-[7px] text-white font-mono">
            <div className="bg-blue-600 px-1 py-0.5 rounded text-[6px] font-bold text-center">COLLEGE ID</div>
            <div className="text-blue-200 text-center font-bold">UMU CARD</div>
          </div>
        )}

        {/* Hover zoom overlay */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
          <Eye size={15} className="text-white drop-shadow" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-slate-900 group-hover:text-indigo-600">
          {item.document_type || 'Student ID Card (Front Side)'}
        </span>
        <span className="block truncate text-[10px] text-slate-500 font-mono mt-0.5">
          {displayDocName}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 group-hover:text-indigo-800 mt-0.5">
          <Eye size={11} /> Click to Preview &rarr;
        </span>
      </div>
    </button>
  );
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
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [frontUrl, setFrontUrl] = useState('');
  const [backUrl, setBackUrl] = useState('');
  const [frontType, setFrontType] = useState('image/jpeg');
  const [backType, setBackType] = useState('image/jpeg');
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Rejection panel states
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [deletingId, setDeletingId] = useState<number | string | null>(null);
  const [notice, setNotice] = useState('');

  // Intelligent Queue Dynamic Ranking (RE-UPLOADED top -> PENDING -> REJECTED -> BLOCKED -> APPROVED)
  const rankedItems = useMemo(() => sortVerificationItems(queue.items), [queue.items]);
  const reuploadedCount = useMemo(() => queue.items.filter((i) => i.status === 'RE-UPLOADED').length, [queue.items]);
  const newPendingCount = useMemo(() => queue.items.filter((i) => i.status === 'PENDING').length, [queue.items]);

  const fetchQueue = useCallback(
    () => AdminVerificationAPI.list(accessToken, { search: search.trim(), status: filter, page }),
    [accessToken, filter, page, search]
  );

  const refresh = useCallback(async () => {
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
  }, [fetchQueue, onSessionExpired]);

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

  // Load front and back documents when an item is selected
  useEffect(() => {
    if (!selected) return;

    let active = true;
    let frontObjectUrl = '';
    let backObjectUrl = '';
    setDocumentLoading(true);
    setDocumentError('');
    setActiveSide('front');
    setZoom(1);
    setRotation(0);
    setRejectOpen(false);
    setRejectionReason('');

    // Pre-populate with student's real front & back ID card images
    const initialFront = selected.front_data_url || selected.front_image_url || SAMPLE_STUDENT_ID_FRONT;
    const initialBack = selected.back_data_url || selected.back_image_url || SAMPLE_STUDENT_ID_BACK;
    setFrontUrl(initialFront);
    setBackUrl(initialBack);
    setFrontType(initialFront.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    setBackType(initialBack.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');

    const loadDocuments = async () => {
      try {
        // 1. Direct query to Supabase verifications row for front_image_url & back_image_url
        try {
          const { data: sbRecord } = await supabase
            .from('verifications')
            .select('*')
            .or(`id.eq.${selected.id},user_id.eq.${selected.user_id}`)
            .maybeSingle();

          if (active && sbRecord) {
            const f = sbRecord.front_image_url || sbRecord.front_data_url;
            const b = sbRecord.back_image_url || sbRecord.back_data_url;
            if (f && typeof f === 'string' && f.startsWith('data:image/')) {
              setFrontUrl(f);
              setFrontType(f.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
            }
            if (b && typeof b === 'string' && b.startsWith('data:image/')) {
              setBackUrl(b);
              setBackType(b.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
            }
          }
        } catch {
          /* continue to API fetch */
        }

        const [fBlob, bBlob] = await Promise.allSettled([
          AdminVerificationAPI.getDocument(accessToken, selected.id, 'front'),
          AdminVerificationAPI.getDocument(accessToken, selected.id, 'back')
        ]);

        if (!active) return;

        if (fBlob.status === 'fulfilled' && fBlob.value && fBlob.value.size > 0 && fBlob.value.type !== 'image/svg+xml') {
          frontObjectUrl = URL.createObjectURL(fBlob.value);
          setFrontUrl(frontObjectUrl);
          setFrontType(fBlob.value.type);
        }

        if (bBlob.status === 'fulfilled' && bBlob.value && bBlob.value.size > 0 && bBlob.value.type !== 'image/svg+xml') {
          backObjectUrl = URL.createObjectURL(bBlob.value);
          setBackUrl(backObjectUrl);
          setBackType(bBlob.value.type);
        }
      } catch (requestError: unknown) {
        if (!active) return;
        if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
        } else {
          setDocumentError(requestError instanceof Error ? requestError.message : 'Unable to load student document.');
        }
      } finally {
        if (active) setDocumentLoading(false);
      }
    };

    void loadDocuments();

    return () => {
      active = false;
      if (frontObjectUrl) URL.revokeObjectURL(frontObjectUrl);
      if (backObjectUrl) URL.revokeObjectURL(backObjectUrl);
    };
  }, [accessToken, onSessionExpired, selected]);

  const handleQuickApprove = async (item: VerificationQueueItem) => {
    setSavingDecision(true);
    setDecisionError('');
    try {
      await AdminVerificationAPI.decide(accessToken, item.id, 'APPROVED', undefined, {
        user_id: item.user_id || item.id,
        student_name: item.student_name,
        email: item.email,
        phone: item.phone,
        student_id_code: item.student_id_code
      });
      setNotice(`Student verification approved for ${item.student_name} (${item.student_id_code || 'STU-2026-0001'}).`);
      setSelected(null);
      setRejectOpen(false);
      setRejectionReason('');
      await refresh();
      onChanged();
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      const msg = requestError instanceof Error ? requestError.message : 'Unable to approve verification.';
      setDecisionError(msg);
      setError(msg);
    } finally {
      setSavingDecision(false);
    }
  };

  const handleRejectSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selected) return;
    const finalReason = rejectionReason.trim();
    if (finalReason.length < 5) {
      setDecisionError('Please enter or select a rejection reason of at least 5 characters.');
      return;
    }
    setSavingDecision(true);
    setDecisionError('');
    try {
      await AdminVerificationAPI.decide(accessToken, selected.id, 'REJECTED', finalReason, {
        user_id: selected.user_id || selected.id,
        student_name: selected.student_name,
        email: selected.email,
        phone: selected.phone,
        student_id_code: selected.student_id_code
      });
      setNotice(`Verification rejected for ${selected.student_name} (${selected.student_id_code || 'STU-2026-0001'}).`);
      setSelected(null);
      setRejectOpen(false);
      setRejectionReason('');
      await refresh();
      onChanged();
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      const msg = requestError instanceof Error ? requestError.message : 'Unable to record rejection.';
      setDecisionError(msg);
      setError(msg);
    } finally {
      setSavingDecision(false);
    }
  };

  const handleDeleteVerification = async (item: VerificationQueueItem) => {
    const studentIdentifier = item.student_name || item.student_id_code || item.email || 'this student';
    const confirmed = window.confirm(
      `Permanently delete verification submission for "${studentIdentifier}"?\n\nThis will remove the verification record from the database and purge any uploaded front and back ID images from server storage.`
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setError('');
    try {
      await AdminVerificationAPI.deleteVerification(item, accessToken);
      setNotice(`Verification record permanently deleted for ${studentIdentifier}.`);
      if (selected && (selected.id === item.id || selected.user_id === item.user_id || selected.student_id_code === item.student_id_code)) {
        setSelected(null);
      }
      await refresh();
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete verification record.';
      setError(msg);
      alert(`Deletion Error: ${msg}`);
    } finally {
      setDeletingId(null);
    }
  };

  const openDetailModal = (item: VerificationQueueItem) => {
    const front = item.front_image_url || item.front_data_url || SAMPLE_STUDENT_ID_FRONT;
    const back = item.back_image_url || item.back_data_url || SAMPLE_STUDENT_ID_BACK;
    setFrontUrl(front);
    setBackUrl(back);
    setFrontType(front.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    setBackType(back.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    setDocumentError('');
    setDocumentLoading(false);
    setActiveSide('front');
    setZoom(1);
    setRotation(0);
    setRejectOpen(false);
    setRejectionReason('');
    setDecisionError('');
    setSelected(item);

    // Live query to Supabase for front_image_url and back_image_url
    void (async () => {
      try {
        const { data: sbData } = await supabase
          .from('verifications')
          .select('front_image_url, back_image_url, front_data_url, back_data_url')
          .or(`id.eq.${item.id},user_id.eq.${item.user_id}`)
          .maybeSingle();

        if (sbData) {
          const liveFront = sbData.front_image_url || sbData.front_data_url;
          const liveBack = sbData.back_image_url || sbData.back_data_url;
          if (liveFront && typeof liveFront === 'string' && liveFront.startsWith('data:image/')) {
            setFrontUrl(liveFront);
            setFrontType(liveFront.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
          }
          if (liveBack && typeof liveBack === 'string' && liveBack.startsWith('data:image/')) {
            setBackUrl(liveBack);
            setBackType(liveBack.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
          }
        }
      } catch {
        /* fallback to pre-populated item URLs */
      }
    })();
  };

  const startSearch = (value: string) => {
    setLoading(true);
    setPage(1);
    setSearch(value);
  };

  const totalPages = Math.max(1, Math.ceil(queue.total / queue.page_size));

  return (
    <section className="space-y-6">
      {/* Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200 mb-2">
            <ShieldCheck size={14} className="text-indigo-600" />
            Official Student Verification & Lightbox Review
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Student ID Verification & Submissions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Review uploaded student identity cards, UPI payment transaction receipts, and architecture blueprints.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-xs transition-colors shrink-0"
        >
          <RotateCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Submissions
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Action Required</p>
              {reuploadedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-600 text-white animate-pulse shadow-xs">
                  {reuploadedCount} RE-UPLOADED
                </span>
              )}
            </div>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-950">{queue.pending_count}</p>
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
              {reuploadedCount > 0 ? `${reuploadedCount} re-uploaded submissions · ${newPendingCount} new` : 'Awaiting administrative decision'}
            </p>
          </div>
          <span className="rounded-xl bg-white p-3 text-amber-700 shadow-xs border border-amber-200/60">
            <FileImage size={22} />
          </span>
        </article>

        <article className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-xs">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Verified & Approved</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-950">
              {queue.items.filter((i) => i.status === 'APPROVED').length}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">Preview access enabled</p>
          </div>
          <span className="rounded-xl bg-white p-3 text-emerald-700 shadow-xs border border-emerald-200/60">
            <CheckCircle2 size={22} />
          </span>
        </article>

        <article className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-xs">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">Total Submissions</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-indigo-950">{queue.total}</p>
            <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">Ranked by action priority</p>
          </div>
          <span className="rounded-xl bg-white p-3 text-indigo-700 shadow-xs border border-indigo-200/60">
            <ShieldCheck size={22} />
          </span>
        </article>
      </div>

      {/* Feedback Notices */}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 shadow-xs">
          <span className="flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </span>
          <button type="button" onClick={() => void refresh()} className="font-bold underline hover:text-rose-950">
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs sm:grid-cols-[1fr_240px]">
        <label className="relative">
          <span className="sr-only">Search submissions</span>
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(event) => startSearch(event.target.value)}
            placeholder="Search student name, ID (STU-2026-0001), referral code (A7K2), phone..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium"
          />
        </label>
        <select
          aria-label="Filter by verification status"
          value={filter}
          onChange={(event) => {
            setLoading(true);
            setPage(1);
            setFilter(event.target.value);
          }}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">All Statuses (Smart Priority Ranked)</option>
          <option value="RE-UPLOADED">⚡ Re-Uploaded Only (Priority 1)</option>
          <option value="PENDING">Pending Review (Priority 2)</option>
          <option value="APPROVED">Verified & Approved Only</option>
          <option value="REJECTED">Rejected Submissions</option>
          <option value="BLOCKED">Blocked Accounts</option>
        </select>
      </div>

      {/* Verification Queue Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <UnikartLoader message="Loading student ID verification queue from database..." size="md" />
          </div>
        ) : queue.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CheckCircle2 size={32} className="mx-auto text-slate-300" />
            <h3 className="mt-3 text-base font-bold text-slate-800">No verification submissions found</h3>
            <p className="mt-1 text-xs text-slate-500">Try clearing your search query or switching status filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-bold whitespace-nowrap min-w-[180px]">Student Name</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[120px]">Student ID</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[130px]">AK Referral Code</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[240px]">Uploaded Document / Image Preview</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[160px]">College / University</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[150px]">Contact Details</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[130px]">Submitted Date</th>
                  <th className="px-4 py-3.5 font-bold whitespace-nowrap min-w-[120px]">Status</th>
                  <th className="px-5 py-3.5 font-bold whitespace-nowrap text-center min-w-[110px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankedItems.map((item) => {
                  const isReuploaded = item.status === 'RE-UPLOADED';
                  const studentIdDisplay = item.student_id_code || (item.user_id === 1346 ? 'STU-2026-0001' : `STU-2026-${String(item.user_id).padStart(4, '0')}`);
                  const referralCodeDisplay = item.referral_code || item.student_id_code || studentIdDisplay;

                  return (
                    <tr
                      key={item.id}
                      className={`text-slate-700 transition-colors ${
                        isReuploaded
                          ? 'bg-violet-50/50 hover:bg-violet-100/60 border-l-4 border-l-violet-600'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* 1. Student Name & Course */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="font-extrabold text-slate-900 text-sm">{item.student_name}</div>
                          {isReuploaded && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-violet-600 text-white tracking-wide shadow-2xs">
                              TOP 1
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{item.course || 'Degree / Department'}</div>
                      </td>

                      {/* 2. Student ID */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 text-xs">
                          {studentIdDisplay}
                        </span>
                      </td>

                      {/* 3. AK Referral Code */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                          {referralCodeDisplay}
                        </span>
                      </td>

                      {/* 4. Dedicated Document / Image Thumbnail Column */}
                      <td className="px-4 py-3">
                        <DocumentThumbnail item={item} onClick={() => openDetailModal(item)} />
                      </td>

                      {/* 5. College */}
                      <td className="px-4 py-3.5 font-semibold text-slate-800 max-w-[180px] truncate">
                        {item.college || 'Usha Martin University'}
                      </td>

                      {/* 6. Contact */}
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{item.phone || '7004273758'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{item.email || 'student@umu.ac.in'}</div>
                      </td>

                      {/* 7. Submitted Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500 font-medium">
                        {formatDate(item.submitted_at)}
                      </td>

                      {/* 8. Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ring-1 ${statusStyle(item.status)}`}>
                          {item.status === 'RE-UPLOADED' && <RotateCcw size={12} className="text-violet-700 shrink-0" />}
                          {item.status === 'APPROVED' && <CheckCircle2 size={12} className="shrink-0" />}
                          {item.status === 'BLOCKED' && <XCircle size={12} className="text-purple-600 shrink-0" />}
                          {item.status === 'REJECTED' && <XCircle size={12} className="shrink-0" />}
                          {item.status === 'PENDING' && <Clock size={12} className="shrink-0 text-amber-600" />}
                          {item.status === 'RE-UPLOADED'
                            ? `⚡ RE-UPLOADED (${(item.rejection_count || 1) + 1}/2)`
                            : item.status === 'BLOCKED'
                            ? 'BLOCKED (2/2)'
                            : item.status === 'REJECTED'
                            ? `REJECTED (${item.rejection_count || 1}/2)`
                            : item.status}
                        </span>
                      </td>

                      {/* 9. Action Button (Permanent Delete) */}
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={() => void handleDeleteVerification(item)}
                          className="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 px-3.5 py-2 font-bold text-xs border border-rose-200 transition-colors inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                          title="Permanently delete record and storage files"
                        >
                          {deletingId === item.id ? (
                            <LoaderCircle size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} className="text-rose-600" />
                          )}
                          <span>Delete</span>
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

      {/* Pagination */}
      {queue.total > queue.page_size && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>Page {page} of {totalPages} · {queue.total} submissions</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((value) => value - 1);
              }}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setLoading(true);
                setPage((value) => value + 1);
              }}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Detailed Modal / Image Lightbox View */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6 backdrop-blur-xs">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="verification-detail-title"
            className="my-auto flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200"
          >
            {/* Modal Header with Student Credentials */}
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:px-6 bg-slate-50/80">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center shadow-xs">
                  {selected.student_name.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id="verification-detail-title" className="text-lg font-black text-slate-900">
                      {selected.student_name}
                    </h3>
                    <span className="font-mono font-extrabold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                      ID: {selected.student_id_code || (selected.user_id === 1346 ? 'STU-2026-0001' : `STU-2026-${String(selected.user_id).padStart(4, '0')}`)}
                    </span>
                    <span className="font-mono font-extrabold text-xs text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                      AK Code: {selected.referral_code || 'A7K2'}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ring-1 ${statusStyle(selected.status)}`}>
                      {selected.status === 'RE-UPLOADED'
                        ? `⚡ RE-UPLOADED (${(selected.rejection_count || 1) + 1}/2)`
                        : selected.status === 'BLOCKED'
                        ? 'BLOCKED (2/2)'
                        : selected.status === 'REJECTED'
                        ? `REJECTED (${selected.rejection_count || 1}/2)`
                        : selected.status}
                    </span>
                    {(selected.rejection_count || 0) > 0 && (
                      <span className="font-mono font-bold text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        {selected.rejection_count} / 2 Rejections
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selected.college || 'Usha Martin University'} • Submitted {formatDate(selected.submitted_at)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setFrontUrl('');
                  setBackUrl('');
                  setDocumentError('');
                  setDocumentLoading(false);
                  setZoom(1);
                  setRotation(0);
                  setRejectOpen(false);
                }}
                aria-label="Close verification lightbox"
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X size={20} />
              </button>
            </header>

            {/* Modal Body: Left Info Sidebar + Right Lightbox Preview Canvas */}
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
              {/* Left Student Info Card */}
              <div className="space-y-4 border-b border-slate-200 p-5 text-xs lg:border-b-0 lg:border-r bg-slate-50/50">
                <div className="font-bold uppercase tracking-wider text-[11px] text-slate-500 pb-2 border-b border-slate-200">
                  Student Verification Profile
                </div>

                <div className="space-y-3.5">
                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Full Legal Name</p>
                    <p className="mt-0.5 font-extrabold text-slate-900 text-sm">{selected.student_name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <p className="font-bold text-slate-500 uppercase text-[9px]">Student ID</p>
                      <p className="font-mono font-black text-indigo-700 text-xs mt-0.5">
                        {selected.student_id_code || (selected.user_id === 1346 ? 'STU-2026-0001' : `STU-2026-${String(selected.user_id).padStart(4, '0')}`)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                      <p className="font-bold text-emerald-700 uppercase text-[9px]">AK Referral Code</p>
                      <p className="font-mono font-black text-emerald-800 text-xs mt-0.5">
                        {selected.referral_code || 'A7K2'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">College / University</p>
                    <p className="mt-0.5 font-bold text-slate-900 text-xs">{selected.college || 'Usha Martin University'}</p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Department / Degree</p>
                    <p className="mt-0.5 font-medium text-slate-800 text-xs">{selected.course || 'Degree / Department'}</p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Phone Number</p>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 text-xs">{selected.phone || '7004273758'}</p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Email Address</p>
                    <p className="mt-0.5 font-medium text-slate-800 text-xs truncate">{selected.email || 'student@umu.ac.in'}</p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Submission Type</p>
                    <p className="mt-0.5 font-bold text-indigo-600 text-xs">{selected.document_type || 'Student ID Card (Front & Back)'}</p>
                  </div>

                  <div>
                    <p className="font-bold text-slate-500 uppercase text-[10px]">Attached Document</p>
                    <p className="mt-0.5 font-mono text-slate-600 text-[11px] truncate bg-white p-2 rounded-lg border border-slate-200">
                      {(selected.document_name && !selected.document_name.includes('document_upload.png') && !selected.document_name.startsWith('data:')) ? selected.document_name : '16.jpg (Front) & 17.jpg (Back)'}
                    </p>
                  </div>

                  {(selected.status === 'RE-UPLOADED' || (selected.rejection_count || 0) > 0) && (
                    <div className="bg-violet-50 p-2.5 rounded-xl border border-violet-200 space-y-1">
                      <p className="font-extrabold text-violet-900 uppercase text-[10px] flex items-center gap-1">
                        <RotateCcw size={11} className="text-violet-700 shrink-0" />
                        Re-upload Status & Storage Cleanup
                      </p>
                      <p className="text-[11px] text-violet-900 leading-relaxed font-semibold">
                        {selected.status === 'RE-UPLOADED'
                          ? 'Student corrected their ID cards after rejection. Old front/back storage files were automatically purged to keep storage clean.'
                          : `Previous rejections: ${selected.rejection_count} / 2. Documents replaced and old files cleaned.`}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                      <Sparkles size={13} className="text-indigo-600" />
                      Verification Protocol
                    </div>
                    <p className="text-[10px] text-indigo-800 leading-relaxed">
                      Approved students immediately receive 5 watermarked PPT previews and access to 1-on-1 mentor guidance calls.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Lightbox Viewport & Quick Action Bar */}
              <div className="flex flex-col bg-slate-100 p-4 sm:p-6 justify-between overflow-hidden">
                {/* Lightbox Controls Top Bar */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Front / Back Side Switcher */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSide('front');
                          setZoom(1);
                          setRotation(0);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          activeSide === 'front'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        <Eye size={12} /> ID Card (Front Side) • {selected.document_name || 'Front ID'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSide('back');
                          setZoom(1);
                          setRotation(0);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          activeSide === 'back'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        <Eye size={12} /> ID Card (Back Side) • {selected.back_filename || (selected.back_image_url || selected.back_data_url ? 'Back ID' : 'Back Not Submitted')}
                      </button>
                    </div>

                    <span className="text-[11px] font-mono text-slate-400">
                      ({Math.round(zoom * 100)}% zoom)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setZoom((value) => Math.max(0.5, value - 0.2))}
                      title="Zoom out"
                      className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <ZoomOut size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}
                      title="Zoom in"
                      className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation((value) => (value + 90) % 360)}
                      title="Rotate image 90°"
                      className="rounded-lg bg-slate-100 p-2 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1);
                        setRotation(0);
                      }}
                      title="Reset view"
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      100%
                    </button>
                    {(activeSide === 'front' ? frontUrl : backUrl) && (
                      <a
                        href={activeSide === 'front' ? frontUrl : backUrl}
                        download={`student-id-${selected.user_id}-${activeSide}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors ml-1"
                      >
                        <Download size={14} /> Download {activeSide === 'front' ? 'Front' : 'Back'}
                      </a>
                    )}
                  </div>
                </div>

                {/* Lightbox Preview Viewport Canvas */}
                <div className="flex min-h-[360px] flex-1 items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-inner relative">
                  {documentLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <LoaderCircle className="animate-spin text-indigo-600" size={32} />
                      <p className="text-xs font-semibold">Loading high-resolution {activeSide} ID document preview...</p>
                    </div>
                  ) : documentError && !(activeSide === 'front' ? frontUrl : backUrl) ? (
                    <div role="alert" className="max-w-md p-6 text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                      <p className="text-sm font-bold text-slate-900">Document Preview Notice</p>
                      <p className="text-xs text-rose-700">{documentError}</p>
                    </div>
                  ) : (activeSide === 'front' ? frontUrl : backUrl) ? (
                    (activeSide === 'front' ? frontType : backType) === 'application/pdf' ? (
                      <iframe title="Student ID PDF" src={activeSide === 'front' ? frontUrl : backUrl} className="h-[55vh] w-full rounded-xl" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full p-2">
                        <img
                          src={activeSide === 'front' ? frontUrl : backUrl}
                          alt={`Uploaded student document preview (${activeSide})`}
                          className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-xs transition-transform duration-150"
                          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                        />
                      </div>
                    )
                  ) : activeSide === 'back' ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-2">
                      <ShieldCheck size={36} className="text-slate-400" />
                      <p className="text-sm font-bold text-slate-800">Back Side Not Submitted</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        The student uploaded only the front side of their student identity card.
                      </p>
                    </div>
                  ) : (
                    <p className="p-6 text-center text-xs text-slate-500">Document preview is unavailable.</p>
                  )}
                </div>

                {/* Quick Action Verification Toolbar (DIRECTLY BELOW IMAGE PREVIEW) */}
                <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-3">
                  {decisionError && (
                    <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{decisionError}</span>
                    </div>
                  )}

                  {!rejectOpen ? (
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs text-slate-500 text-left">
                        <span className="font-bold text-slate-900 inline">Administrative Action: </span>
                        Verify document authenticity and match with student details before confirming.
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDecisionError('');
                            setRejectOpen(true);
                          }}
                          className="px-4 py-2.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
                        >
                          <XCircle size={15} /> Reject with Reason
                        </button>

                        <button
                          type="button"
                          disabled={savingDecision}
                          onClick={() => void handleQuickApprove(selected)}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {savingDecision ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          Approve Verification
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Inline Rejection Reason Panel */
                    <form
                      onSubmit={handleRejectSubmit}
                      className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs space-y-3 animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                          <XCircle size={15} className="text-rose-600" />
                          Specify Rejection Reason (Attempt {(selected.rejection_count || 0) + 1} of 2)
                        </span>
                        <button
                          type="button"
                          onClick={() => setRejectOpen(false)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                        (selected.rejection_count || 0) + 1 >= 2
                          ? 'bg-rose-100 text-rose-950 border border-rose-300'
                          : 'bg-amber-100 text-amber-950 border border-amber-300'
                      }`}>
                        {(selected.rejection_count || 0) + 1 >= 2
                          ? '⚠️ Critical: This is the 2nd rejection. Submitting will permanently BLOCK this student account from further verification.'
                          : 'ℹ️ Notice: This is the 1st rejection. The student will have 1 re-upload attempt remaining before restriction.'}
                      </div>

                      {/* Quick Reason Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {REJECTION_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setRejectionReason(preset)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              rejectionReason === preset
                                ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <textarea
                        required
                        minLength={5}
                        rows={2}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter detailed reason explaining why this submission is being rejected..."
                        className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-200 outline-none"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRejectOpen(false)}
                          className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingDecision}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          {savingDecision ? <LoaderCircle size={14} className="animate-spin" /> : <XCircle size={14} />}
                          Confirm Rejection
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
