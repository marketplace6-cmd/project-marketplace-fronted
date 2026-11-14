import { useEffect, useState, FormEvent } from 'react';
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
  ArrowRight,
  Wallet,
  Lock,
  AlertCircle,
  X,
  Filter,
  Search
} from 'lucide-react';
import {
  ReferralApiError,
  StudentReferralAPI,
  StudentReferralDashboard,
  StudentReferralHistoryItem,
  StudentPayoutAPI,
  WithdrawalRequestItem
} from './referralService';
import { supabase } from '../utils/supabase/client';

export interface ReferredStudentItem {
  id: string | number;
  level: number;
  studentId: string;
  studentName: string;
  contact: string;
  email?: string;
  phone?: string;
  college?: string;
  course?: string;
  status: 'Approved' | 'Pending' | 'Not Approved';
  orderId?: number | null;
  rewardEarned: number;
  joinedAt: string;
}

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
  studentName?: string;
  studentMobile?: string;
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

export const BASE_LEVEL_CONFIG = [
  {
    level: 1,
    name: 'Direct Classmates',
    badge: 'Level 1 (Direct)',
    commission: '15%',
    ratePerSale: 150,
    description: 'Students who registered directly with your personal AK Referral Code.'
  },
  {
    level: 2,
    name: 'Peer Invites',
    badge: 'Level 2 (Secondary)',
    commission: '10%',
    ratePerSale: 100,
    description: 'Students invited by your direct Level 1 classmates.'
  },
  {
    level: 3,
    name: 'Department Network',
    badge: 'Level 3 (Tertiary)',
    commission: '5%',
    ratePerSale: 50,
    description: 'Extended academic circle across branches and semesters.'
  },
  {
    level: 4,
    name: 'Campus Community',
    badge: 'Level 4 (Network)',
    commission: '2.5%',
    ratePerSale: 25,
    description: 'Campus-wide collegiate network from your university.'
  }
] as const;

export function createInitialLevelStats(): ReferralLevelStat[] {
  return BASE_LEVEL_CONFIG.map((tier) => ({
    ...tier,
    activeCount: 0,
    totalEarnings: 0
  }));
}

function createDefaultDashboard(studentId: string, referralCode: string): StudentReferralDashboard {
  return {
    student_id: studentId,
    referral_id: 8402,
    referral_code: referralCode,
    status: 'ACTIVE',
    referral_link: typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${referralCode}`
      : `https://uvikart.com/register?ref=${referralCode}`,
    total_successful_referrals: 0,
    pending_referrals: 0,
    eligible_rewards: 0,
    paid_rewards: 0,
    history: []
  };
}

export default function StudentReferralPage({
  accessToken,
  onSessionExpired,
  onLogin,
  studentId = 'STU-2026-0001',
  studentName = 'Mayank Kumar',
  studentMobile = '7004273758',
  referralCode = 'A7K2',
  onToast
}: StudentReferralPageProps) {
  const [dashboard, setDashboard] = useState<StudentReferralDashboard>(() => {
    return createDefaultDashboard(studentId, referralCode);
  });
  const [levelStats, setLevelStats] = useState<ReferralLevelStat[]>(createInitialLevelStats);
  const [payouts, setPayouts] = useState<ReferralPayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  // Active tab inside Referral Rewards: 'levels' | 'payouts' | 'history'
  const [activeTab, setActiveTab] = useState<'levels' | 'payouts' | 'history'>('levels');

  // Copy button visual states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Withdrawal Form State
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [upiId, setUpiId] = useState('mayank@okaxis');
  const [mobileNumber, setMobileNumber] = useState(studentMobile || '7004273758');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  // Network Breakdown State (Levels 1-4)
  const [networkStudents, setNetworkStudents] = useState<ReferredStudentItem[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [levelStatusFilter, setLevelStatusFilter] = useState<'ALL' | 'Approved' | 'Pending' | 'Not Approved'>('ALL');
  const [levelSearch, setLevelSearch] = useState<string>('');

  useEffect(() => {
    let active = true;

    const loadLiveReferralData = async () => {
      setLoading(true);
      setError('');
      const effectiveCode = referralCode || 'A7K2';
      const effectiveId = studentId || 'STU-2026-0001';

      try {
        // 1. Backend API attempt (if accessToken available)
        let backendData: StudentReferralDashboard | null = null;
        if (accessToken) {
          try {
            backendData = await StudentReferralAPI.getMine(accessToken);
          } catch {
            /* continue to live Supabase retrieval */
          }
        }

        // 2. Query Supabase for real live referral, order, verification, and payout records
        let refRows: any[] = [];
        let orderRows: any[] = [];
        let payoutRows: any[] = [];
        let verifRows: any[] = [];

        try {
          const [refRes, orderRes, payoutRes, verifRes] = await Promise.all([
            supabase
              .from('referrals')
              .select('*')
              .or(`referral_code.eq.${effectiveCode},referrer_student_id.eq.${effectiveId}`)
              .order('created_at', { ascending: false }),
            supabase
              .from('orders')
              .select('*')
              .eq('referral_code', effectiveCode)
              .order('created_at', { ascending: false }),
            supabase
              .from('payouts')
              .select('*')
              .or(`referral_code.eq.${effectiveCode},student_id.eq.${effectiveId}`)
              .order('created_at', { ascending: false }),
            supabase
              .from('verifications')
              .select('*')
              .eq('referral_code', effectiveCode)
              .order('created_at', { ascending: false })
          ]);

          if (!refRes.error && refRes.data) refRows = refRes.data;
          if (!orderRes.error && orderRes.data) orderRows = orderRes.data;
          if (!payoutRes.error && payoutRes.data) payoutRows = payoutRes.data;
          if (!verifRes.error && verifRes.data) verifRows = verifRes.data;
        } catch {
          /* Supabase offline or schema unavailable */
        }

        // Incorporate local verification queue if any
        try {
          const rawLocalQueue = localStorage.getItem('cpm_verification_queue') || localStorage.getItem('cpm_verifications');
          if (rawLocalQueue) {
            const parsed = JSON.parse(rawLocalQueue);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item.referral_code === effectiveCode && !verifRows.some((v) => String(v.id) === String(item.id) || String(v.user_id) === String(item.user_id))) {
                  verifRows.push(item);
                }
              }
            }
          }
        } catch {
          /* ignore */
        }

        if (!active) return;

        // 3. Construct Level-wise referred students directory (Levels 1-4)
        const studentMap = new Map<string, ReferredStudentItem>();

        // (a) Level 1: Direct Classmates from verifications
        for (const v of verifRows) {
          const stdId = v.student_id_code || (v.user_id ? `STU-2026-${String(v.user_id).padStart(4, '0')}` : `STU-2026-${String(v.id).padStart(4, '0')}`);
          const matchingOrder = orderRows.find(
            (o) => String(o.student_id) === String(stdId) || (o.email && o.email === v.email) || (o.phone && o.phone === v.phone)
          );
          const isApproved = v.status === 'APPROVED' || matchingOrder?.status === 'COMPLETED' || matchingOrder?.payment_status === 'PAID';
          const isRejected = v.status === 'REJECTED';
          const studentStatus: 'Approved' | 'Pending' | 'Not Approved' = isApproved
            ? 'Approved'
            : isRejected
            ? 'Not Approved'
            : 'Pending';
          const reward = matchingOrder
            ? Math.round(Number(matchingOrder.amount || 1000) * 0.15)
            : (isApproved ? 150 : 0);

          studentMap.set(stdId, {
            id: `verif-${v.id}`,
            level: 1,
            studentId: stdId,
            studentName: v.student_name || 'Classmate',
            contact: [v.phone, v.email].filter(Boolean).join(' • ') || '—',
            email: v.email || undefined,
            phone: v.phone || undefined,
            college: v.college || undefined,
            course: v.course || undefined,
            status: studentStatus,
            orderId: matchingOrder ? Number(matchingOrder.id) : null,
            rewardEarned: reward,
            joinedAt: v.submitted_at || v.created_at || new Date().toISOString()
          });
        }

        // (b) Multi-tier referral records from referrals table (Levels 1-4)
        for (const r of refRows) {
          const stdId = r.referred_student_id || `STU-2026-${String(r.id).padStart(4, '0')}`;
          const lvl = Math.min(4, Math.max(1, Number(r.level || 1)));
          const isApproved = r.status === 'SUCCESSFUL' || r.status === 'COMPLETED' || r.reward_status === 'PAID' || r.reward_status === 'ELIGIBLE';
          const isRejected = r.status === 'REJECTED' || r.status === 'REVERSED';
          const studentStatus: 'Approved' | 'Pending' | 'Not Approved' = isApproved
            ? 'Approved'
            : isRejected
            ? 'Not Approved'
            : 'Pending';
          const tierRate = BASE_LEVEL_CONFIG.find((b) => b.level === lvl)?.ratePerSale || 150;
          const reward = r.reward_amount ? Number(r.reward_amount) : (isApproved ? tierRate : 0);

          if (!studentMap.has(stdId)) {
            studentMap.set(stdId, {
              id: `ref-${r.id}`,
              level: lvl,
              studentId: stdId,
              studentName: r.referred_student_name || r.student_name || `Student ${stdId.slice(-4)}`,
              contact: r.contact || [r.phone, r.email].filter(Boolean).join(' • ') || '—',
              email: r.email || undefined,
              phone: r.phone || undefined,
              college: r.college || undefined,
              course: r.course || undefined,
              status: studentStatus,
              orderId: r.order_id ? Number(r.order_id) : null,
              rewardEarned: reward,
              joinedAt: r.created_at || new Date().toISOString()
            });
          }
        }

        // (c) Qualifying direct orders
        for (const o of orderRows) {
          const stdId = o.student_id || `STU-2026-${String(o.id).padStart(4, '0')}`;
          if (!studentMap.has(stdId)) {
            const isPaid = o.status === 'COMPLETED' || o.payment_status === 'PAID' || o.payment_status === 'COMPLETED';
            studentMap.set(stdId, {
              id: `order-${o.id}`,
              level: 1,
              studentId: stdId,
              studentName: o.student_name || `Customer #${o.id}`,
              contact: [o.phone, o.email].filter(Boolean).join(' • ') || '—',
              email: o.email || undefined,
              phone: o.phone || undefined,
              status: isPaid ? 'Approved' : 'Pending',
              orderId: Number(o.id),
              rewardEarned: isPaid ? Math.round(Number(o.amount || 1000) * 0.15) : 0,
              joinedAt: o.created_at || new Date().toISOString()
            });
          }
        }

        const liveStudents = Array.from(studentMap.values()).sort(
          (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()
        );
        setNetworkStudents(liveStudents);

        // 4. Merge real records into live attribution history
        const historyMap = new Map<number, StudentReferralHistoryItem>();

        // Incorporate backend data if any
        if (backendData?.history) {
          for (const item of backendData.history) {
            historyMap.set(item.id, item);
          }
        }

        // Incorporate Supabase referrals
        for (const r of refRows) {
          const id = Number(r.id);
          const isCompleted = r.status === 'SUCCESSFUL' || r.status === 'COMPLETED' || r.reward_status === 'PAID';
          historyMap.set(id, {
            id,
            status: r.status || (isCompleted ? 'COMPLETED' : 'PENDING_QUALIFYING_PURCHASE'),
            created_at: r.created_at || new Date().toISOString(),
            order_id: r.order_id ? Number(r.order_id) : null,
            reward_amount: r.reward_amount ? Number(r.reward_amount) : (isCompleted ? 150 : null),
            reward_currency: r.reward_currency || 'INR',
            reward_status: r.reward_status || (isCompleted ? 'PAID' : 'PENDING')
          });
        }

        // Incorporate live qualifying purchases from orders table
        for (const o of orderRows) {
          const orderId = Number(o.id);
          const alreadyExists = Array.from(historyMap.values()).some((h) => h.order_id === orderId);
          if (!alreadyExists) {
            const syntheticId = 1000 + orderId;
            const isPaid = o.status === 'COMPLETED' || o.payment_status === 'PAID' || o.payment_status === 'COMPLETED';
            historyMap.set(syntheticId, {
              id: syntheticId,
              status: isPaid ? 'COMPLETED' : 'PENDING_QUALIFYING_PURCHASE',
              created_at: o.created_at || new Date().toISOString(),
              order_id: orderId,
              reward_amount: isPaid ? Math.round(Number(o.amount || 1000) * 0.15) : null,
              reward_currency: o.currency || 'INR',
              reward_status: isPaid ? 'ELIGIBLE' : 'PENDING'
            });
          }
        }

        const liveHistory = Array.from(historyMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // 5. Calculate summary counters strictly from live data
        const totalSuccessful = liveHistory.filter(
          (h) => h.status === 'COMPLETED' || h.status === 'SUCCESSFUL' || h.reward_status === 'PAID'
        ).length;

        const pendingReferrals = liveHistory.filter(
          (h) => h.status === 'PENDING' || h.status === 'PENDING_QUALIFYING_PURCHASE' || h.status === 'REGISTERED'
        ).length;

        const eligibleRewards = liveHistory
          .filter((h) => h.reward_status === 'ELIGIBLE' || (h.status === 'COMPLETED' && h.reward_status !== 'PAID'))
          .reduce((sum, h) => sum + (h.reward_amount || 0), 0);

        const paidRewards = liveHistory
          .filter((h) => h.reward_status === 'PAID' || h.reward_status === 'SETTLED')
          .reduce((sum, h) => sum + (h.reward_amount || 0), 0);

        // 6. Calculate Level 1-4 stats strictly from live data
        const updatedLevelStats = BASE_LEVEL_CONFIG.map((tier) => {
          const tierStudents = liveStudents.filter((s) => s.level === tier.level);
          const activeStudents = tierStudents.length;
          let tierEarnings = tierStudents.reduce((sum, s) => sum + s.rewardEarned, 0);

          if (tier.level === 1 && tierEarnings === 0 && (totalSuccessful > 0 || eligibleRewards > 0 || paidRewards > 0)) {
            tierEarnings = eligibleRewards + paidRewards;
          }

          return {
            ...tier,
            activeCount: activeStudents,
            totalEarnings: tierEarnings
          };
        });
        setLevelStats(updatedLevelStats);

        // 6. Calculate Payout ledger strictly from live data (Supabase + Local Cache)
        let livePayouts: ReferralPayoutRecord[] = [];
        try {
          const payoutItems = await StudentPayoutAPI.list(effectiveId, effectiveCode);
          if (payoutItems.length > 0) {
            livePayouts = payoutItems.map((p) => ({
              id: p.payout_id,
              date: new Date(p.created_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              amount: Number(p.amount || 0),
              paymentMode: p.payment_method === 'UPI' ? 'UPI Transfer' : 'Bank NEFT Transfer',
              account: p.payment_method === 'UPI'
                ? (p.upi_id || 'UPI VPA')
                : `${p.bank_account ? `A/C ••••${p.bank_account.slice(-4)}` : 'Bank A/C'} (${p.ifsc_code || ''})`,
              status: p.status === 'PAID' ? 'PAID' : (p.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING'),
              utrRef: p.utr_ref || (p.status === 'PAID' ? 'Settled' : 'Processing (Within 20 Hours)')
            }));
          }
        } catch {
          /* fallback to empty payouts */
        }
        setPayouts(livePayouts);

        // 7. Update Dashboard state
        setDashboard({
          student_id: effectiveId,
          referral_id: backendData?.referral_id || 8402,
          referral_code: effectiveCode,
          status: 'ACTIVE',
          referral_link: typeof window !== 'undefined'
            ? `${window.location.origin}/register?ref=${effectiveCode}`
            : `https://uvikart.com/register?ref=${effectiveCode}`,
          total_successful_referrals: totalSuccessful,
          pending_referrals: pendingReferrals,
          eligible_rewards: eligibleRewards,
          paid_rewards: paidRewards,
          history: liveHistory
        });
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load live referral data.');
        setDashboard(createDefaultDashboard(effectiveId, effectiveCode));
        setLevelStats(createInitialLevelStats());
        setNetworkStudents([]);
        setPayouts([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLiveReferralData();

    // Realtime Supabase Subscription: Auto-update on new referrals, orders, verifications, or payouts
    const channel = supabase
      .channel(`uvikart-referral-live-${referralCode || 'A7K2'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, () => {
        void loadLiveReferralData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadLiveReferralData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, () => {
        void loadLiveReferralData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => {
        void loadLiveReferralData();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
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
  const totalNetworkEarnings = levelStats.reduce((sum, tier) => sum + tier.totalEarnings, 0);

  // Pending withdrawals hold and available withdrawal balance
  const pendingWithdrawalTotal = payouts
    .filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING')
    .reduce((sum, p) => sum + p.amount, 0);
  const availableBalance = Math.max(0, dashboard.eligible_rewards - pendingWithdrawalTotal);
  const level1Referrals = levelStats.find((tier) => tier.level === 1)?.activeCount || 0;
  const isWithdrawalUnlocked = level1Referrals >= 1 && availableBalance > 0;

  const handleWithdrawSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setWithdrawError('');
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError('Please enter a valid withdrawal amount greater than ₹0.');
      return;
    }
    if (amt > availableBalance) {
      setWithdrawError(`Withdrawal amount cannot exceed your available balance of ${formatCurrency(availableBalance)}.`);
      return;
    }
    if (withdrawMethod === 'UPI') {
      if (!upiId.trim() || !upiId.includes('@')) {
        setWithdrawError('Please enter a valid UPI ID (e.g. yourname@bank).');
        return;
      }
      if (!mobileNumber.trim() || mobileNumber.replace(/\D/g, '').length < 10) {
        setWithdrawError('Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      if (!bankAccountNumber.trim() || bankAccountNumber.length < 8) {
        setWithdrawError('Please enter a valid Bank Account Number (at least 8 digits).');
        return;
      }
      if (!ifscCode.trim() || ifscCode.length < 4) {
        setWithdrawError('Please enter a valid IFSC Code.');
        return;
      }
    }

    setSubmittingWithdrawal(true);
    try {
      const payoutId = `PAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const createdItem = await StudentPayoutAPI.submitWithdrawal({
        payout_id: payoutId,
        student_id: effectiveStudentId,
        student_name: studentName,
        referral_code: effectiveCode,
        amount: amt,
        currency: 'INR',
        payment_method: withdrawMethod,
        upi_id: withdrawMethod === 'UPI' ? upiId.trim() : undefined,
        phone: mobileNumber.trim(),
        bank_account: withdrawMethod === 'BANK_TRANSFER' ? bankAccountNumber.trim() : undefined,
        ifsc_code: withdrawMethod === 'BANK_TRANSFER' ? ifscCode.trim().toUpperCase() : undefined,
        branch_name: withdrawMethod === 'BANK_TRANSFER' ? branchName.trim() : undefined,
        status: 'PENDING',
        utr_ref: 'Processing (Within 20 Hours)',
        notes: `Student requested withdrawal of ${formatCurrency(amt)} via ${withdrawMethod}`
      });

      const newRecord: ReferralPayoutRecord = {
        id: createdItem.payout_id,
        date: 'Just now',
        amount: amt,
        paymentMode: withdrawMethod === 'UPI' ? 'UPI Transfer' : 'Bank NEFT Transfer',
        account: withdrawMethod === 'UPI' ? upiId.trim() : `A/C ••••${bankAccountNumber.slice(-4)} (${ifscCode.toUpperCase()})`,
        status: 'PENDING',
        utrRef: 'Processing (Within 20 Hours)'
      };

      setPayouts((prev) => [newRecord, ...prev]);
      setWithdrawModalOpen(false);
      setWithdrawAmount('');
      setActiveTab('payouts');
      onToast?.(`Withdrawal request of ${formatCurrency(amt)} submitted! Transfer will be completed within 20 hours.`, 'success');
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Failed to submit withdrawal request.');
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

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
            <span>Available Balance</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{formatCurrency(availableBalance)}</p>
          <p className="mt-1 text-[11px] text-emerald-600 font-semibold">
            {pendingWithdrawalTotal > 0
              ? `₹${pendingWithdrawalTotal} processing (within 20h)`
              : 'Eligible for instant withdrawal'}
          </p>
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

      {/* Withdraw Earnings Action Banner */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-emerald-50/60 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`p-3 rounded-2xl flex items-center justify-center shrink-0 ${
              isWithdrawalUnlocked ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {isWithdrawalUnlocked ? <Wallet className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">Withdraw Earnings</h3>
              {isWithdrawalUnlocked ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={12} /> Unlocked · Available: {formatCurrency(availableBalance)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  <Lock size={12} /> Locked
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              {level1Referrals === 0
                ? 'Unlockable after achieving at least 1 Level 1 referral. Share your AK Referral Code to get direct classmates to register and purchase.'
                : availableBalance <= 0
                ? 'Level 1 unlocked! Payout becomes available as soon as your referrals generate eligible rewards.'
                : 'Your withdrawal request will be processed and transferred within 20 hours to your verified UPI ID or Bank account.'}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={() => {
              if (isWithdrawalUnlocked) {
                setWithdrawAmount(String(availableBalance));
                setWithdrawError('');
                setWithdrawModalOpen(true);
              }
            }}
            disabled={!isWithdrawalUnlocked}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold shadow-xs transition-all ${
              isWithdrawalUnlocked
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95 shadow-emerald-600/20 shadow-md'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isWithdrawalUnlocked ? <Wallet size={16} /> : <Lock size={16} />}
            <span>Withdraw Earnings</span>
          </button>
        </div>
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
      {activeTab === 'levels' && (() => {
        const selectedTierConfig = BASE_LEVEL_CONFIG.find((b) => b.level === selectedLevel) || BASE_LEVEL_CONFIG[0];
        const currentLevelAllStudents = networkStudents.filter((s) => s.level === selectedLevel);
        const approvedCount = currentLevelAllStudents.filter((s) => s.status === 'Approved').length;
        const pendingCount = currentLevelAllStudents.filter((s) => s.status === 'Pending').length;
        const notApprovedCount = currentLevelAllStudents.filter((s) => s.status === 'Not Approved').length;

        const filteredLevelStudents = currentLevelAllStudents.filter((s) => {
          const matchesStatus =
            levelStatusFilter === 'ALL'
              ? true
              : levelStatusFilter === 'Approved'
              ? s.status === 'Approved'
              : levelStatusFilter === 'Pending'
              ? s.status === 'Pending'
              : s.status === 'Not Approved';

          const q = levelSearch.toLowerCase().trim();
          const matchesSearch =
            !q ||
            s.studentName.toLowerCase().includes(q) ||
            s.studentId.toLowerCase().includes(q) ||
            s.contact.toLowerCase().includes(q) ||
            (s.college && s.college.toLowerCase().includes(q)) ||
            (s.course && s.course.toLowerCase().includes(q));

          return matchesStatus && matchesSearch;
        });

        return (
          <section className="space-y-6">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">4-Tier Multi-Level Reward Structure</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Earn residual rewards not just from friends you refer, but also from the peer networks they invite.
                </p>
              </div>
              <div className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-xl border border-indigo-200">
                Total Network Earnings: <strong>{formatCurrency(totalNetworkEarnings)}</strong>
              </div>
            </div>

            {/* 4 Interactive Tier Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {levelStats.map((tier) => {
                const isSelected = selectedLevel === tier.level;
                return (
                  <div
                    key={tier.level}
                    onClick={() => {
                      setSelectedLevel(tier.level);
                      setLevelStatusFilter('ALL');
                      setLevelSearch('');
                    }}
                    className={`cursor-pointer rounded-2xl border p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all text-left ${
                      isSelected
                        ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/30 shadow-md shadow-indigo-600/5'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-black text-[11px] border transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                          }`}
                        >
                          Level {tier.level}
                        </span>
                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {tier.commission} Reward
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-slate-900 text-sm mt-1">{tier.name}</h4>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                            Active Level
                          </span>
                        )}
                      </div>
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
                );
              })}
            </div>

            {/* Level-Wise Detailed Breakdown Section */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
              {/* Header with Level Selector Tabs */}
              <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs">
                      Level {selectedTierConfig.level}
                    </span>
                    <h4 className="text-base font-extrabold text-slate-900">
                      {selectedTierConfig.name} Directory
                    </h4>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {selectedTierConfig.commission} Reward Rate (~₹{selectedTierConfig.ratePerSale}/sale)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    {selectedTierConfig.description}
                  </p>
                </div>

                {/* Level Selector Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  {BASE_LEVEL_CONFIG.map((tier) => {
                    const count = networkStudents.filter((s) => s.level === tier.level).length;
                    const isSelected = selectedLevel === tier.level;
                    return (
                      <button
                        key={tier.level}
                        type="button"
                        onClick={() => {
                          setSelectedLevel(tier.level);
                          setLevelStatusFilter('ALL');
                          setLevelSearch('');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <span>Level {tier.level}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                            isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter Bar & Search */}
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                {/* Status Filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter size={13} /> Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setLevelStatusFilter('ALL')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      levelStatusFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({currentLevelAllStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelStatusFilter('Approved')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      levelStatusFilter === 'Approved'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
                    }`}
                  >
                    Approved / Successful ({approvedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelStatusFilter('Pending')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      levelStatusFilter === 'Pending'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50'
                    }`}
                  >
                    Pending ({pendingCount})
                  </button>
                  {notApprovedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setLevelStatusFilter('Not Approved')}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                        levelStatusFilter === 'Not Approved'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50'
                      }`}
                    >
                      Not Approved ({notApprovedCount})
                    </button>
                  )}
                </div>

                {/* Search Box */}
                <div className="relative min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={levelSearch}
                    onChange={(e) => setLevelSearch(e.target.value)}
                    placeholder="Search student, ID, contact..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Students List / Table */}
              {filteredLevelStudents.length === 0 ? (
                <div className="py-14 px-5 text-center">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-slate-900">
                    {levelSearch || levelStatusFilter !== 'ALL'
                      ? `No students match your filter in Level ${selectedLevel}`
                      : `No referrals in Level ${selectedLevel} yet`}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    {levelSearch || levelStatusFilter !== 'ALL'
                      ? 'Try resetting your status filter or search term to see other students in this tier.'
                      : selectedLevel === 1
                      ? 'No direct classmates have registered with your AK Referral Code yet. Share your code with classmates to start building your direct Level 1 network!'
                      : selectedLevel === 2
                      ? 'No peer invites yet. When your direct Level 1 classmates refer other students, they will automatically appear here as Level 2 referrals.'
                      : selectedLevel === 3
                      ? 'No department network referrals yet. Referrals invited by your Level 2 peers will appear in Level 3.'
                      : 'No campus community referrals yet. Campus-wide network expansion will appear here as your referral chain grows.'}
                  </p>
                  {selectedLevel === 1 && !levelSearch && levelStatusFilter === 'ALL' && (
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        onClick={copyCode}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Copy size={13} /> Copy Code ({effectiveCode})
                      </button>
                      <button
                        onClick={copyLink}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Share2 size={13} /> Share Link
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Student ID</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Contact Details</th>
                        <th className="py-3 px-4">Academic Course / College</th>
                        <th className="py-3 px-4">Verification / Status</th>
                        <th className="py-3 px-4">Reward Generated</th>
                        <th className="py-3 px-4">Date Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredLevelStudents.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[11px]">
                              {student.studentId}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {student.studentName}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <div className="space-y-0.5">
                              {student.phone && <p className="font-mono text-slate-800 text-[11px]">{student.phone}</p>}
                              {student.email && <p className="text-[11px] text-slate-500">{student.email}</p>}
                              {!student.phone && !student.email && <p className="text-slate-400">—</p>}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <p className="font-semibold text-slate-800">{student.college || 'College'}</p>
                            <p className="text-[11px] text-slate-500">{student.course || 'Degree / Dept'}</p>
                          </td>
                          <td className="py-3 px-4">
                            {student.status === 'Approved' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 size={12} /> Approved
                              </span>
                            ) : student.status === 'Pending' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                                <Clock size={12} /> Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                                <X size={12} /> Not Approved
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            {student.rewardEarned > 0 ? (
                              <span className="text-emerald-700 font-extrabold">+{formatCurrency(student.rewardEarned)}</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Awaiting order</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {new Date(student.joinedAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Level Progress Summary Audit Table */}
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
                    {levelStats.map((tier) => (
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
        );
      })()}

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

          {payouts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <CreditCard className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-800">No payout settlements yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No referral activity yet. Share your AK Referral Code to start earning! Payout settlements are automatically disbursed to your verified UPI account once students complete verified project purchases.
              </p>
            </div>
          ) : (
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
                    {payouts.map((payout) => (
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
                              <Clock size={12} /> Processing (Within 20 Hours)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
              <p className="mt-3 text-sm font-bold text-slate-800">No qualifying orders yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No referral activity yet. Share your AK Referral Code to start earning! When students register and purchase verified projects with your code, their qualifying orders will appear here.
              </p>
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

      {/* Interactive Withdrawal Request Form Modal */}
      {withdrawModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submittingWithdrawal) setWithdrawModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-modal-title"
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="withdraw-modal-title" className="text-base font-extrabold text-slate-900">
                    Withdraw Referral Earnings
                  </h3>
                  <p className="text-xs text-slate-500">
                    Available Balance: <strong className="text-emerald-600 font-mono">{formatCurrency(availableBalance)}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWithdrawModalOpen(false)}
                disabled={submittingWithdrawal}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleWithdrawSubmit} className="p-6 space-y-4">
              {/* Notice Banner */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-2.5 text-amber-900 text-xs">
                <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  <p className="font-bold text-amber-900">
                    Your withdrawal request will be processed and transferred within 20 hours.
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Transfers are made directly via instant UPI or NEFT. You will receive a transaction UTR reference upon completion.
                  </p>
                </div>
              </div>

              {withdrawError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2 font-semibold">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="withdraw-amount-input" className="text-xs font-bold text-slate-700">
                    Withdrawal Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(availableBalance))}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Withdraw All ({formatCurrency(availableBalance)})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    id="withdraw-amount-input"
                    type="number"
                    min="1"
                    max={availableBalance}
                    step="1"
                    required
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`e.g. ${availableBalance}`}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </div>

              {/* Payment Method Switcher */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-700">Primary Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWithdrawMethod('UPI')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      withdrawMethod === 'UPI'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    UPI Transfer (Primary)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithdrawMethod('BANK_TRANSFER')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      withdrawMethod === 'BANK_TRANSFER'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Bank Account (Optional/Alt)
                  </button>
                </div>
              </div>

              {/* UPI Fields */}
              {withdrawMethod === 'UPI' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label htmlFor="upi-id-input" className="text-xs font-semibold text-slate-700">
                      Primary UPI ID (VPA) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="upi-id-input"
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="e.g. studentname@okaxis or mobile@upi"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="mobile-input" className="text-xs font-semibold text-slate-700">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="mobile-input"
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="e.g. 7004273758"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Bank Details Fields (Optional / Alternative) */}
              {withdrawMethod === 'BANK_TRANSFER' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label htmlFor="bank-acc-input" className="text-xs font-semibold text-slate-700">
                      Bank Account Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="bank-acc-input"
                      type="text"
                      required
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="Enter full bank account number"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label htmlFor="ifsc-input" className="text-xs font-semibold text-slate-700">
                        IFSC Code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="ifsc-input"
                        type="text"
                        required
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                        placeholder="e.g. SBIN0001234"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="branch-input" className="text-xs font-semibold text-slate-700">
                        Branch Name (Optional)
                      </label>
                      <input
                        id="branch-input"
                        type="text"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder="e.g. Ranchi Main"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bank-mobile-input" className="text-xs font-semibold text-slate-700">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="bank-mobile-input"
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="e.g. 7004273758"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(false)}
                  disabled={submittingWithdrawal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWithdrawal}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingWithdrawal ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Wallet size={14} />
                      <span>Confirm & Withdraw {withdrawAmount ? `₹${withdrawAmount}` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
