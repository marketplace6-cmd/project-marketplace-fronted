import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
  CreditCard,
  Clock,
  CheckCircle2,
  Wallet,
  Check,
  ShieldCheck,
  Layers
} from 'lucide-react';
import {
  AdminReferralAPI,
  AdminReferralDetail,
  AdminReferralPageResult,
  AdminPayoutAPI,
  WithdrawalRequestItem,
  ReferralApiError
} from '../referralService';
import { supabase } from '../../utils/supabase/client';

interface AdminReferralPageProps {
  accessToken: string;
  onSessionExpired: () => void;
}

function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function displayStatus(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function AdminReferralPage({ accessToken, onSessionExpired }: AdminReferralPageProps) {
  // Top level active tab: 'payouts' | 'attributions'
  const [activeTab, setActiveTab] = useState<'payouts' | 'attributions'>('payouts');

  // --- TAB 1: Payouts & Student Withdrawal Requests State ---
  const [payouts, setPayouts] = useState<WithdrawalRequestItem[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [payoutFilter, setPayoutFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [payoutError, setPayoutError] = useState('');

  // Settlement Modal State
  const [settlingItem, setSettlingItem] = useState<WithdrawalRequestItem | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState('');

  // --- TAB 2: Referral Attributions State ---
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

  // Load Payout Requests
  const loadPayouts = async () => {
    setPayoutLoading(true);
    setPayoutError('');
    try {
      const items = await AdminPayoutAPI.listAll();
      setPayouts(items);
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : 'Unable to load withdrawal requests.');
    } finally {
      setPayoutLoading(false);
    }
  };

  useEffect(() => {
    void loadPayouts();

    // Subscribe to realtime changes on 'payouts' table
    const channel = supabase
      .channel('admin-payouts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => {
        void loadPayouts();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Load Referral Attribution Records
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

  const refreshAttributions = () => {
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

  const openSettlementModal = (item: WithdrawalRequestItem) => {
    setSettlingItem(item);
    setSettlementError('');
    setUtrInput(`UPI/UVK/${Date.now().toString().slice(-6)}/${item.payout_id.replace(/\D/g, '').slice(-4) || '9012'}`);
  };

  const handleConfirmSettlement = async (e: FormEvent) => {
    e.preventDefault();
    if (!settlingItem) return;
    if (!utrInput.trim()) {
      setSettlementError('Please enter a valid Bank / UPI Transaction UTR Reference.');
      return;
    }

    setIsSubmittingSettlement(true);
    setSettlementError('');
    try {
      await AdminPayoutAPI.markPaid(settlingItem.payout_id, utrInput.trim());
      setSettlingItem(null);
      await loadPayouts();
    } catch (err) {
      setSettlementError(err instanceof Error ? err.message : 'Failed to mark payout as settled.');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  // Filtered payouts
  const filteredPayouts = payouts.filter((p) => {
    const matchesFilter =
      payoutFilter === 'ALL'
        ? true
        : payoutFilter === 'PENDING'
        ? p.status === 'PENDING' || p.status === 'PROCESSING'
        : p.status === 'PAID';

    const q = payoutSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.payout_id.toLowerCase().includes(q) ||
      (p.student_name && p.student_name.toLowerCase().includes(q)) ||
      p.student_id.toLowerCase().includes(q) ||
      p.referral_code.toLowerCase().includes(q) ||
      (p.upi_id && p.upi_id.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.bank_account && p.bank_account.includes(q));

    return matchesFilter && matchesSearch;
  });

  const pendingCount = payouts.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length;
  const pendingAmount = payouts
    .filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paidCount = payouts.filter((p) => p.status === 'PAID').length;
  const paidAmount = payouts
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;

  return (
    <div className="space-y-6">
      {/* Header & Main Tab Switcher */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-900">Referral & Payout Management</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Audit student referral attributions, track reward earnings, and process 20-hour withdrawal requests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <ShieldCheck size={14} /> 20-Hour Transfer SLA
            </span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 gap-2 mt-6">
          <button
            onClick={() => setActiveTab('payouts')}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'payouts'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Student Withdrawal Requests & Payouts</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[10px]">
                {pendingCount} Pending
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('attributions')}
            className={`flex items-center gap-2 pb-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'attributions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Referral Attribution Records</span>
          </button>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* TAB 1: STUDENT WITHDRAWAL REQUESTS & PAYOUTS                              */}
      {/* ========================================================================= */}
      {activeTab === 'payouts' && (
        <section className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Total Withdrawal Requests</span>
                <CreditCard className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{payouts.length}</p>
              <p className="mt-1 text-[11px] text-slate-500">Lifetime requests received</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                <span>Pending Processing (20h SLA)</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-black text-amber-900">{formatCurrency(pendingAmount)}</p>
              <p className="mt-1 text-[11px] text-amber-700 font-semibold">{pendingCount} student request{pendingCount === 1 ? '' : 's'} awaiting payout</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span>Completed / Settled</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-900">{formatCurrency(paidAmount)}</p>
              <p className="mt-1 text-[11px] text-emerald-700 font-semibold">{paidCount} payout{paidCount === 1 ? '' : 's'} transferred & settled</p>
            </div>
          </div>

          {/* Search, Filter & Controls */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={payoutSearch}
                  onChange={(e) => setPayoutSearch(e.target.value)}
                  placeholder="Search by student, ID, referral code, UPI, phone..."
                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPayoutFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    payoutFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({payouts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    payoutFilter === 'PENDING' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutFilter('PAID')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    payoutFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Settled ({paidCount})
                </button>
              </div>
            </div>

            <button
              onClick={() => void loadPayouts()}
              disabled={payoutLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={payoutLoading ? 'animate-spin' : ''} />
              <span>Refresh Payouts</span>
            </button>
          </div>

          {/* Payouts Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {payoutError ? (
              <div role="alert" className="p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Payout records are unavailable</p>
                <p className="mt-1 text-sm text-rose-700">{payoutError}</p>
                <button
                  onClick={() => void loadPayouts()}
                  className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Retry
                </button>
              </div>
            ) : payoutLoading ? (
              <div aria-label="Loading payouts" className="h-64 animate-pulse flex items-center justify-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-600" />
                Loading student withdrawal requests...
              </div>
            ) : filteredPayouts.length === 0 ? (
              <div className="px-5 py-16 text-center text-xs text-slate-500">
                <CreditCard className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-800">No withdrawal requests found</p>
                <p className="mt-1 text-xs text-slate-500">
                  {payoutSearch ? 'No records match your search filter.' : 'Student withdrawal requests will appear here when submitted.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">Payout ID</th>
                      <th className="px-4 py-3.5">Date Requested</th>
                      <th className="px-4 py-3.5">Student Details</th>
                      <th className="px-4 py-3.5">Referral Code</th>
                      <th className="px-4 py-3.5">Amount (₹)</th>
                      <th className="px-4 py-3.5">Destination & Payment Info</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredPayouts.map((item) => {
                      const isPending = item.status === 'PENDING' || item.status === 'PROCESSING';
                      return (
                        <tr key={item.payout_id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5 font-mono font-bold text-indigo-700">
                            {item.payout_id}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                            {new Date(item.created_at).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-bold text-slate-900">{item.student_name || 'Student'}</p>
                            <p className="text-[11px] font-mono text-slate-500">{item.student_id}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {item.referral_code}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono font-black text-slate-900 text-sm">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-4 py-3.5">
                            {item.payment_method === 'UPI' ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-900 flex items-center gap-1">
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-extrabold">UPI</span>
                                  <span className="font-mono">{item.upi_id || '—'}</span>
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">Mobile: {item.phone || '—'}</p>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-900 flex items-center gap-1">
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-extrabold">BANK</span>
                                  <span className="font-mono">A/C: {item.bank_account || '—'}</span>
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  IFSC: {item.ifsc_code} {item.branch_name ? `• ${item.branch_name}` : ''} • Tel: {item.phone}
                                </p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={12} /> PENDING (Within 20 Hours)
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 size={12} /> PAID / SETTLED
                                </span>
                                {item.utr_ref && (
                                  <p className="text-[10px] font-mono text-slate-500 pl-1">{item.utr_ref}</p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isPending ? (
                              <button
                                onClick={() => openSettlementModal(item)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                              >
                                <Check size={14} /> Transfer & Mark PAID
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">Settled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REFERRAL ATTRIBUTION RECORDS                                       */}
      {/* ========================================================================= */}
      {activeTab === 'attributions' && (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Referral Attribution Records</h2>
                <p className="mt-1 text-xs text-slate-500">Search by Student ID or Referral ID. Contact details are not shown.</p>
              </div>
              <button
                onClick={refreshAttributions}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <form onSubmit={searchRecords} className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
              <label className="relative">
                <span className="sr-only">Search by Student ID or Referral ID</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Student ID or Referral ID"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400"
                />
              </label>
              <label>
                <span className="sr-only">Referral status</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setError('');
                    setLoading(true);
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
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
                <select
                  value={rewardStatus}
                  onChange={(event) => {
                    setError('');
                    setLoading(true);
                    setRewardStatus(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="">All reward statuses</option>
                  <option value="ELIGIBLE">Eligible</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                  <option value="REDEEMED">Redeemed</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="REVERSED">Reversed</option>
                </select>
              </label>
              <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                Search
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {error ? (
              <div role="alert" className="p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Referral records are unavailable</p>
                <p className="mt-1 text-sm text-rose-700">{error}</p>
                <button onClick={refreshAttributions} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Retry</button>
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
        </div>
      )}

      {/* Admin Settlement Modal */}
      {settlingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingSettlement) setSettlingItem(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settle-modal-title"
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="settle-modal-title" className="text-base font-extrabold text-slate-900">
                    Settle Student Payout
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {settlingItem.payout_id} · {settlingItem.student_name || settlingItem.student_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettlingItem(null)}
                disabled={isSubmittingSettlement}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmSettlement} className="p-6 space-y-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs space-y-2">
                <div className="flex justify-between items-center text-emerald-950">
                  <span className="font-semibold">Payable Amount:</span>
                  <span className="text-lg font-black font-mono text-emerald-700">
                    {formatCurrency(settlingItem.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-emerald-900 pt-1 border-t border-emerald-200/60">
                  <span className="font-semibold">Transfer Mode:</span>
                  <span className="font-bold">{settlingItem.payment_method === 'UPI' ? 'UPI Transfer' : 'Bank NEFT Transfer'}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-900">
                  <span className="font-semibold">Destination:</span>
                  <span className="font-mono font-bold">
                    {settlingItem.payment_method === 'UPI'
                      ? settlingItem.upi_id
                      : `A/C ${settlingItem.bank_account} (${settlingItem.ifsc_code})`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-emerald-900">
                  <span className="font-semibold">Student Phone:</span>
                  <span className="font-mono">{settlingItem.phone || '—'}</span>
                </div>
              </div>

              {settlementError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2 font-semibold">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{settlementError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="utr-ref-input" className="text-xs font-bold text-slate-700">
                  Bank / UPI Transaction Reference (UTR) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="utr-ref-input"
                  type="text"
                  required
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. UPI/20261115/9821 or UTR-2026-9901"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold font-mono text-slate-900 outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Provide the bank confirmation UTR to mark this withdrawal as paid and settled in the student's dashboard.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSettlingItem(null)}
                  disabled={isSubmittingSettlement}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSettlement}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingSettlement ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Settling...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirm & Mark as PAID</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Referral History Modal */}
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
