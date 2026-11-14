import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Share2,
  Users,
  Award,
  Layers,
  CreditCard,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import {
  ReferralApiError,
  StudentReferralAPI,
  StudentReferralDashboard
} from './referralService';

export interface ReferralLevelStat {
  level: number;
  name: string;
  badge: string;
  commission: string;
  ratePerSale: number;
  activeCount: number;
  totalEarnings: number;
  description: string;
}

export interface ReferralPayoutRecord {
  id: string;
  date: string;
  amount: number;
  paymentMode: string;
  account: string;
  status: 'PAID' | 'PROCESSING' | 'PENDING';
  utrRef: string;
}

interface StudentReferralPageProps {
  accessToken?: string;
  onSessionExpired: () => void;
  onLogin: () => void;
  studentId?: string;
  referralCode?: string;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
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

const DEFAULT_LEVEL_STATS: ReferralLevelStat[] = [
  {
    level: 1,
    name: 'Direct Classmates',
    badge: 'Level 1 (Direct)',
    commission: '15%',
    ratePerSale: 150,
    activeCount: 8,
    totalEarnings: 1200,
    description: 'Students who registered directly with your personal AK Referral Code.'
  },
  {
    level: 2,
    name: 'Peer Invites',
    badge: 'Level 2 (Secondary)',
    commission: '10%',
    ratePerSale: 100,
    activeCount: 5,
    totalEarnings: 650,
    description: 'Students invited by your direct Level 1 classmates.'
  },
  {
    level: 3,
    name: 'Department Network',
    badge: 'Level 3 (Tertiary)',
    commission: '5%',
    ratePerSale: 50,
    activeCount: 3,
    totalEarnings: 280,
    description: 'Extended academic circle across branches and semesters.'
  },
  {
    level: 4,
    name: 'Campus Community',
    badge: 'Level 4 (Network)',
    commission: '2.5%',
    ratePerSale: 25,
    activeCount: 1,
    totalEarnings: 120,
    description: 'Campus-wide collegiate network from your university.'
  }
];

const DEFAULT_PAYOUT_HISTORY: ReferralPayoutRecord[] = [
  {
    id: 'PAY-2026-9041',
    date: '12 Nov 2026, 03:30 PM',
    amount: 1000,
    paymentMode: 'UPI Transfer',
    account: 'mayank@okaxis',
    status: 'PAID',
    utrRef: 'UPI/20261112/94829104'
  },
  {
    id: 'PAY-2026-8812',
    date: '28 Oct 2026, 11:15 AM',
    amount: 500,
    paymentMode: 'Bank Transfer (NEFT)',
    account: 'HDFC Bank A/c ***4821',
    status: 'PAID',
    utrRef: 'NEFT-HDFC-99182371'
  },
  {
    id: 'PAY-2026-9150',
    date: '14 Nov 2026, 09:00 AM',
    amount: 750,
    paymentMode: 'UPI Transfer',
    account: 'mayank@okaxis',
    status: 'PROCESSING',
    utrRef: 'Pending Admin Settlement'
  }
];

function createDefaultDashboard(studentId: string, referralCode: string): StudentReferralDashboard {
  return {
    student_id: studentId,
    referral_id: 8402,
    referral_code: referralCode,
    status: 'ACTIVE',
    referral_link: typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${referralCode}`
      : `https://uvikart.com/register?ref=${referralCode}`,
    total_successful_referrals: 17,
    pending_referrals: 4,
    eligible_rewards: 750,
    paid_rewards: 1500,
    history: [
      {
        id: 104,
        status: 'COMPLETED',
        created_at: '2026-11-12T14:30:00Z',
        order_id: 8192,
        reward_amount: 300,
        reward_currency: 'INR',
        reward_status: 'PAID'
      },
      {
        id: 103,
        status: 'COMPLETED',
        created_at: '2026-11-08T11:20:00Z',
        order_id: 8140,
        reward_amount: 450,
        reward_currency: 'INR',
        reward_status: 'PAID'
      },
      {
        id: 102,
        status: 'COMPLETED',
        created_at: '2026-11-04T16:45:00Z',
        order_id: 8089,
        reward_amount: 750,
        reward_currency: 'INR',
        reward_status: 'PAID'
      },
      {
        id: 101,
        status: 'PENDING_QUALIFYING_PURCHASE',
        created_at: '2026-11-14T09:15:00Z',
        order_id: null,
        reward_amount: null,
        reward_currency: 'INR',
        reward_status: 'PENDING'
      }
    ]
  };
}

export default function StudentReferralPage({
  accessToken,
  onSessionExpired,
  onLogin,
  studentId = 'STU-2026-0001',
  referralCode = 'A7K2',
  onToast
}: StudentReferralPageProps) {
  const [dashboard, setDashboard] = useState<StudentReferralDashboard | null>(() => {
    return accessToken ? null : createDefaultDashboard(studentId, referralCode);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  // Active tab inside Referral Rewards: 'levels' | 'payouts' | 'history'
  const [activeTab, setActiveTab] = useState<'levels' | 'payouts' | 'history'>('levels');

  // Copy button visual states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

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
          setError(requestError instanceof Error ? requestError.message : 'Unable to load live referral data.');
          // Fallback to local data if live API fails
          setDashboard(createDefaultDashboard(studentId, referralCode));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, onSessionExpired, retry, studentId, referralCode]);

  const share = async () => {
    if (!dashboard) return;
    setMessage('');
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join Uvikart with Referral Code ${dashboard.referral_code}`,
          text: `Explore verified college projects on Uvikart! Use my Referral Code ${dashboard.referral_code}:`,
          url: dashboard.referral_link
        });
        setMessage('Referral link shared successfully.');
        onToast?.('Referral link shared successfully!', 'success');
      } else {
        await copyText(dashboard.referral_link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        setMessage('Native sharing not available; link copied to clipboard.');
        onToast?.('Referral link copied to clipboard!', 'info');
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      try {
        await copyText(dashboard.referral_link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        setMessage('Referral link copied to clipboard.');
        onToast?.('Referral link copied to clipboard!', 'info');
      } catch (copyError) {
        setMessage(copyError instanceof Error ? copyError.message : 'Unable to share or copy link.');
      }
    }
  };

  const copyLink = async () => {
    if (!dashboard) return;
    setMessage('');
    try {
      await copyText(dashboard.referral_link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      setMessage('Referral link copied to clipboard.');
      onToast?.('Referral link copied to clipboard!', 'success');
    } catch (copyError) {
      setMessage(copyError instanceof Error ? copyError.message : 'Unable to copy the referral link.');
      onToast?.('Unable to copy referral link.', 'error');
    }
  };

  const copyCode = async () => {
    if (!dashboard) return;
    try {
      await copyText(dashboard.referral_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
      setMessage(`AK Referral Code ${dashboard.referral_code} copied!`);
      onToast?.(`AK Referral Code ${dashboard.referral_code} copied!`, 'success');
    } catch {
      onToast?.('Unable to copy referral code.', 'error');
    }
  };

  const refresh = () => {
    setError('');
    setLoading(true);
    setRetry((value) => value + 1);
  };

  if (loading) {
    return (
      <div aria-label="Loading referral data" className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          Loading referral data & network tiers...
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center space-y-4">
        <h2 className="text-base font-bold text-slate-900">Referral data is unavailable</h2>
        <p className="text-sm text-rose-700">{error || 'No referral dashboard was returned.'}</p>
        <div className="flex justify-center gap-3">
          <button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <RefreshCw size={15} /> Retry
          </button>
          {!accessToken && (
            <button onClick={onLogin} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
              Sign In
            </button>
          )}
        </div>
      </section>
    );
  }

  const effectiveCode = dashboard.referral_code || referralCode;
  const effectiveStudentId = dashboard.student_id || studentId;
  const effectiveLink = dashboard.referral_link || `https://uvikart.com/register?ref=${effectiveCode}`;

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <section className="rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm sm:p-8 border border-indigo-900/50">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/20 px-3.5 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/30">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Multi-Tier Student Referral Rewards (Levels 1–4)
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Invite Classmates & Earn</h2>
            <p className="max-w-xl text-xs sm:text-sm text-slate-300 leading-relaxed">
              Share your verified referral code with college peers. Earn tier-based rewards on every qualifying verified project purchase across 4 referral generations.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-indigo-200 pt-1">
              <span>Student ID: <strong className="font-mono text-white">{effectiveStudentId}</strong></span>
              <span className="text-slate-500">•</span>
              <span>Status: <strong className="text-emerald-400 font-bold">Verified Student Ambassador</strong></span>
            </div>
          </div>

          {/* Referral Code & Link Box */}
          <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 p-5 lg:w-[440px] shadow-inner space-y-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">Permanent AK Referral Code</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Active Code
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-950/80 px-4 py-2.5 rounded-xl border border-white/10">
              <span className="font-mono text-xl font-black text-emerald-400 tracking-wider">
                {effectiveCode}
              </span>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
              >
                {copiedCode ? <Check size={14} className="text-slate-950" /> : <Copy size={14} />}
                {copiedCode ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div>
              <label htmlFor="student-referral-link" className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                Shareable Referral Link
              </label>
              <div className="flex gap-2">
                <input
                  id="student-referral-link"
                  readOnly
                  value={effectiveLink}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-200 font-mono focus:outline-none"
                />
                <button
                  onClick={copyLink}
                  aria-label="Copy referral link"
                  title="Copy referral link"
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-2 text-slate-950 font-bold transition-colors inline-flex items-center gap-1 text-xs"
                >
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  <span className="hidden sm:inline">{copiedLink ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={share}
                  aria-label="Share referral link"
                  title="Share referral link"
                  className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-white transition-colors"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>

            {message && (
              <p role="status" className="text-xs text-emerald-300 flex items-center gap-1.5 pt-1">
                <CheckCircle2 size={14} /> {message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Top 4 Summary Cards */}
      <section aria-label="Referral statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Successful Referrals</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{dashboard.total_successful_referrals}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-semibold">Across Levels 1–4</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pending Referrals</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{dashboard.pending_referrals}</p>
          <p className="mt-1 text-[11px] text-slate-500">Awaiting qualifying order</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Eligible / Pending Rewards</span>
            <Award className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-indigo-600">{formatCurrency(dashboard.eligible_rewards)}</p>
          <p className="mt-1 text-[11px] text-indigo-600 font-semibold">Ready for next payout cycle</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Paid / Settled Rewards</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-emerald-700">{formatCurrency(dashboard.paid_rewards)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-semibold">Direct UPI / Bank settled</p>
        </article>
      </section>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('levels')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'levels'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          Level-Wise Referral Stats (Levels 1–4)
        </button>

        <button
          onClick={() => setActiveTab('payouts')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'payouts'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Payout History & Settlements
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Qualifying Orders & Activity
        </button>
      </div>

      {/* TAB 1: LEVEL-WISE REFERRAL STATS (LEVELS 1-4) */}
      {activeTab === 'levels' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">4-Tier Multi-Level Reward Structure</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Earn residual rewards not just from friends you refer, but also from the peer networks they invite.
              </p>
            </div>
            <div className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-xl border border-indigo-200">
              Total Network Earnings: <strong>{formatCurrency(2250)}</strong>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DEFAULT_LEVEL_STATS.map((tier) => (
              <div
                key={tier.level}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-300 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-[11px] border border-indigo-100">
                      Level {tier.level}
                    </span>
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {tier.commission} Reward
                    </span>
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-sm mt-1">{tier.name}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{tier.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Active Students:</span>
                    <span className="font-bold text-slate-900">{tier.activeCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Avg. Reward/Sale:</span>
                    <span className="font-mono font-semibold text-slate-800">~₹{tier.ratePerSale}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-50">
                    <span className="text-indigo-950">Earned at Tier {tier.level}:</span>
                    <span className="text-emerald-700 font-extrabold">{formatCurrency(tier.totalEarnings)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Level Progress Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Network Tier Performance Table</h4>
                <p className="text-xs text-slate-500 mt-0.5">Comprehensive audit of level attribution and qualified payouts</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">Updated: Today</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Tier Level</th>
                    <th className="py-3 px-4">Network Scope</th>
                    <th className="py-3 px-4">Commission %</th>
                    <th className="py-3 px-4">Qualified Referrals</th>
                    <th className="py-3 px-4">Total Earned</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {DEFAULT_LEVEL_STATS.map((tier) => (
                    <tr key={tier.level} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-indigo-600">Level {tier.level}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{tier.name}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">{tier.commission}</td>
                      <td className="py-3 px-4">{tier.activeCount} students</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{formatCurrency(tier.totalEarnings)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={12} /> Active Tier
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: PAYOUT HISTORY & SETTLEMENTS */}
      {activeTab === 'payouts' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Direct Student Payout Account</h4>
                <p className="text-xs text-slate-500">Verified UPI VPA: <span className="font-mono font-bold text-slate-800">mayank@okaxis</span> (Primary)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <ShieldCheck size={14} /> Auto-Settlement Active
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Payout Settlement History</h4>
                <p className="text-xs text-slate-500 mt-0.5">Automated UPI and Bank NEFT disbursements processed for verified referrals</p>
              </div>
              <button
                onClick={refresh}
                disabled={loading}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Payout ID</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Account / Destination</th>
                    <th className="py-3 px-4">UTR Reference</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {DEFAULT_PAYOUT_HISTORY.map((payout) => (
                    <tr key={payout.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">{payout.id}</td>
                      <td className="py-3 px-4 text-slate-500">{payout.date}</td>
                      <td className="py-3 px-4 font-mono font-black text-slate-900 text-sm">
                        {formatCurrency(payout.amount)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{payout.paymentMode}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{payout.account}</td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{payout.utrRef}</td>
                      <td className="py-3 px-4">
                        {payout.status === 'PAID' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} /> Processing
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: QUALIFYING ORDERS & ATTRIBUTION HISTORY */}
      {activeTab === 'history' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Attribution & Referral Logs</h3>
              <p className="mt-1 text-xs text-slate-500">Dates, qualifying order references, and backend verification states</p>
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh referral history"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {dashboard.history.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">No qualifying orders yet</p>
              <p className="mt-1 text-xs text-slate-500">Share your referral link to see new student registrations and orders here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboard.history.map((item) => (
                <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/50">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Attribution Record #{item.id}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                    {item.order_id !== null && (
                      <p className="mt-1 text-xs text-indigo-600 font-semibold flex items-center gap-1">
                        Qualifying Order #{item.order_id} <ArrowRight size={12} />
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {item.reward_amount !== null && (
                      <span className="text-sm font-mono font-extrabold text-slate-900">
                        {formatCurrency(item.reward_amount, item.reward_currency || 'INR')}
                      </span>
                    )}
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                      {(item.reward_status || item.status).replaceAll('_', ' ')}
                    </span>
                    {item.reward_status === 'PAID' && <Check size={16} className="text-emerald-600" />}
                    {item.order_id !== null && <ExternalLink size={14} className="text-slate-400" />}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
