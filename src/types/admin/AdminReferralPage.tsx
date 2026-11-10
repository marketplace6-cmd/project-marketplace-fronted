import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import {
  AdminReferralAPI,
  AdminReferralDetail,
  AdminReferralPageResult,
  ReferralApiError
} from '../referralService';

interface AdminReferralPageProps {
  accessToken: string;
  onSessionExpired: () => void;
}

function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

function displayStatus(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function AdminReferralPage({ accessToken, onSessionExpired }: AdminReferralPageProps) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rewardStatus, setRewardStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminReferralPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminReferralDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let active = true;
    AdminReferralAPI.list(accessToken, {
        search: appliedSearch,
        status,
        rewardStatus,
        page
      })
      .then((data) => {
        if (!active) return;
        setResult(data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ReferralApiError && [401, 403].includes(requestError.status)) {
          onSessionExpired();
        } else {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load referral records.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, appliedSearch, status, rewardStatus, page, retry, onSessionExpired]);

  const searchRecords = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const refresh = () => {
    setError('');
    setLoading(true);
    setRetry((value) => value + 1);
  };

  const openDetail = async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      setDetail(await AdminReferralAPI.get(accessToken, id));
    } catch (requestError) {
      if (requestError instanceof ReferralApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
      } else {
        setDetailError(requestError instanceof Error ? requestError.message : 'Unable to load referral history.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Referral records</h2>
            <p className="mt-1 text-xs text-slate-500">Search by Student ID or Referral ID. Contact details are not shown.</p>
          </div>
          <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <form onSubmit={searchRecords} className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
          <label className="relative">
            <span className="sr-only">Search by Student ID or Referral ID</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student ID or Referral ID" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" />
          </label>
          <label>
            <span className="sr-only">Referral status</span>
            <select value={status} onChange={(event) => { setError(''); setLoading(true); setStatus(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value="">All referral statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="REGISTERED">Registered</option>
              <option value="SUCCESSFUL">Successful</option>
              <option value="REFUND_PENDING">Refund pending</option>
              <option value="REWARD_REVERSED">Reward reversed</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Reward status</span>
            <select value={rewardStatus} onChange={(event) => { setError(''); setLoading(true); setRewardStatus(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value="">All reward statuses</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="REDEEMED">Redeemed</option>
              <option value="ON_HOLD">On hold</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Search</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div role="alert" className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Referral records are unavailable</p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <button onClick={refresh} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Retry</button>
          </div>
        ) : loading ? (
          <div aria-label="Loading referral records" className="h-64 animate-pulse bg-white" />
        ) : !result || result.items.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-slate-500">No referral records match these filters.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Referral ID</th>
                    <th className="px-4 py-3">Referrer Student ID</th>
                    <th className="px-4 py-3">Referred Student ID</th>
                    <th className="px-4 py-3">Referral status</th>
                    <th className="px-4 py-3">Reward status</th>
                    <th className="px-4 py-3">Qualifying order</th>
                    <th className="px-4 py-3">Reward</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.items.map((item) => (
                    <tr key={`${item.id}-${item.attribution_id ?? 'code'}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700">{item.referral_code}</td>
                      <td className="px-4 py-3 font-mono">{item.referrer_student_id || '—'}</td>
                      <td className="px-4 py-3 font-mono">{item.referred_student_id || '—'}</td>
                      <td className="px-4 py-3">{displayStatus(item.status)}</td>
                      <td className="px-4 py-3">{item.reward_status ? displayStatus(item.reward_status) : '—'}</td>
                      <td className="px-4 py-3">{item.order_id ? `#${item.order_id}` : '—'}</td>
                      <td className="px-4 py-3">{item.reward_amount === null ? '—' : formatCurrency(item.reward_amount, item.reward_currency || 'INR')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(item.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => void openDetail(item.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-white">History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>{result.total} record{result.total === 1 ? '' : 's'} · Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                <button onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} disabled={page <= 1} aria-label="Previous page" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft size={15} /></button>
                <button onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} disabled={page >= pageCount} aria-label="Next page" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronRight size={15} /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="referral-history-heading" className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 id="referral-history-heading" className="text-sm font-bold text-slate-900">Referral and reward history</h2>
                <p className="mt-1 font-mono text-xs text-indigo-700">{detail?.referral_code || 'Loading…'}</p>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close referral details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {detailLoading ? (
              <div aria-label="Loading referral detail" className="h-40 animate-pulse" />
            ) : detailError ? (
              <p role="alert" className="p-6 text-sm text-rose-700">{detailError}</p>
            ) : detail ? (
              <div className="space-y-5 p-5">
                <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-3">
                  <div><dt className="text-slate-500">Referrer Student ID</dt><dd className="mt-1 font-mono font-semibold">{detail.referrer_student_id || '—'}</dd></div>
                  <div><dt className="text-slate-500">Referral status</dt><dd className="mt-1 font-semibold">{displayStatus(detail.status)}</dd></div>
                  <div><dt className="text-slate-500">Created</dt><dd className="mt-1">{new Date(detail.created_at).toLocaleString()}</dd></div>
                </dl>
                {detail.attributions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">No student has registered with this referral ID yet.</p>
                ) : detail.attributions.map((attribution) => (
                  <article key={attribution.id ?? attribution.created_at} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold">{attribution.referred_student_id || 'Student ID unavailable'}</span>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700">{displayStatus(attribution.status)}</span>
                      <span className="text-slate-500">{new Date(attribution.created_at).toLocaleString()}</span>
                    </div>
                    {attribution.reward_history.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        {attribution.reward_history.map((reward) => (
                          <div key={reward.id} className="flex flex-wrap justify-between gap-2 text-xs">
                            <span>Order #{reward.order_id} · {formatCurrency(reward.eligible_amount, reward.currency)} purchase</span>
                            <span className="font-semibold">{formatCurrency(reward.reward_amount, reward.currency)} · {displayStatus(reward.status)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
                {detail.reward_history.length > 0 && (
                  <p className="text-[11px] text-slate-500">Reward records are read-only; payment and refund outcomes are not changed from this page.</p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
