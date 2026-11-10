import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, RefreshCw, Share2, Users } from 'lucide-react';
import {
  ReferralApiError,
  StudentReferralAPI,
  StudentReferralDashboard
} from './referralService';

interface StudentReferralPageProps {
  accessToken?: string;
  onSessionExpired: () => void;
  onLogin: () => void;
}

function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(field);
  if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
}

export default function StudentReferralPage({
  accessToken,
  onSessionExpired,
  onLogin
}: StudentReferralPageProps) {
  const [dashboard, setDashboard] = useState<StudentReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    StudentReferralAPI.getMine(accessToken)
      .then((data) => {
        if (!active) return;
        setDashboard(data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ReferralApiError && [401, 403].includes(requestError.status)) {
          onSessionExpired();
        } else {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load referral data.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, onSessionExpired, retry]);

  const share = async () => {
    if (!dashboard) return;
    setMessage('');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join CampusProjects', url: dashboard.referral_link });
        setMessage('Referral link shared.');
      } else {
        await copyText(dashboard.referral_link);
        setMessage('Sharing is unavailable here; the link was copied instead.');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      try {
        await copyText(dashboard.referral_link);
        setMessage('Unable to open sharing; the link was copied instead.');
      } catch (copyError) {
        setMessage(copyError instanceof Error ? copyError.message : 'Unable to share or copy the link.');
      }
    }
  };

  const copyLink = async () => {
    if (!dashboard) return;
    setMessage('');
    try {
      await copyText(dashboard.referral_link);
      setMessage('Referral link copied.');
    } catch (copyError) {
      setMessage(copyError instanceof Error ? copyError.message : 'Unable to copy the referral link.');
    }
  };

  const refresh = () => {
    setError('');
    setLoading(true);
    setRetry((value) => value + 1);
  };

  if (!accessToken) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Users className="mx-auto h-9 w-9 text-indigo-600" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Sign in to view referrals</h2>
        <p className="mt-1 text-sm text-slate-600">Your referral code and reward history are private to your student account.</p>
        <button onClick={onLogin} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Student sign in
        </button>
      </section>
    );
  }

  if (loading) {
    return <div aria-label="Loading referral data" className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  }

  if (error || !dashboard) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center">
        <h2 className="text-base font-bold text-slate-900">Referral data is unavailable</h2>
        <p className="mt-2 text-sm text-rose-700">{error || 'No referral dashboard was returned.'}</p>
        <button onClick={refresh} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-r from-indigo-950 to-slate-900 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="space-y-3">
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">Referral Program</span>
            <h2 className="text-2xl font-extrabold">Invite classmates</h2>
            <p className="max-w-xl text-sm text-slate-300">
              Rewards are calculated by the backend only after a qualifying confirmed payment. Registration alone does not earn a reward.
            </p>
            <p className="text-xs text-indigo-200">Student ID: <span className="font-mono font-bold">{dashboard.student_id || 'Unavailable'}</span></p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/15 bg-white/10 p-4 lg:w-[440px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200">Permanent Referral ID</p>
            <p className="mt-1 font-mono text-lg font-bold">{dashboard.referral_code}</p>
            <label htmlFor="student-referral-link" className="mt-3 block text-[11px] text-slate-300">Referral link</label>
            <div className="mt-1 flex gap-2">
              <input id="student-referral-link" readOnly value={dashboard.referral_link} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white" />
              <button onClick={copyLink} aria-label="Copy referral link" className="rounded-lg bg-emerald-400 px-3 text-slate-950 hover:bg-emerald-300">
                <Copy size={16} />
              </button>
              <button onClick={share} aria-label="Share referral link" className="rounded-lg border border-white/20 px-3 text-white hover:bg-white/10">
                <Share2 size={16} />
              </button>
            </div>
            {message && <p role="status" className="mt-2 text-xs text-emerald-200">{message}</p>}
          </div>
        </div>
      </section>

      <section aria-label="Referral statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Successful referrals', dashboard.total_successful_referrals],
          ['Pending referrals', dashboard.pending_referrals],
          ['Eligible rewards', formatCurrency(dashboard.eligible_rewards)],
          ['Paid / redeemed rewards', formatCurrency(dashboard.paid_rewards)]
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Referral history</h3>
            <p className="mt-1 text-xs text-slate-500">Only the dates, status and your reward transaction references are shown.</p>
          </div>
          <button onClick={refresh} disabled={loading} aria-label="Refresh referral history" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {dashboard.history.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No referrals yet</p>
            <p className="mt-1 text-xs text-slate-500">Share your referral link to see new registrations here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dashboard.history.map((item) => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Referral #{item.id}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                  {item.order_id !== null && <p className="mt-1 text-xs text-slate-500">Qualifying order #{item.order_id}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {item.reward_amount !== null && (
                    <span className="text-xs font-semibold text-slate-700">
                      {formatCurrency(item.reward_amount, item.reward_currency || 'INR')}
                    </span>
                  )}
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                    {(item.reward_status || item.status).replaceAll('_', ' ')}
                  </span>
                  {item.reward_status === 'PAID' && <Check size={15} className="text-emerald-600" />}
                  {item.order_id !== null && <ExternalLink size={14} className="text-slate-400" />}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
