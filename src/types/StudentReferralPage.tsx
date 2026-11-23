import React, { useEffect, useState, useMemo, FormEvent, Component, ErrorInfo, ReactNode } from 'react';
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
import UnikartLoader from './UnikartLoader';

// Error Boundary to prevent any blank white screen crash
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ReferralErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ReferralErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Referral Network Temporarily Unavailable</h2>
          <p className="text-xs text-rose-700 max-w-md mx-auto">
            {this.state.error?.message || 'A temporary issue occurred while rendering your referral dashboard.'}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

export interface TeamMember {
  id: string;
  studentId: string;
  studentName: string;
  collegeName: string;
  level: 1 | 2 | 3 | 4;
  type: 'Direct' | 'Indirect';
  referredByName: string;
  referredById: string;
  verificationStatus: 'Verified' | 'Pending Review' | 'Rejected' | 'ID Not Uploaded';
  meetingStatus: '5-Min Meet Booked' | 'Meet Scheduled' | 'No Meeting Yet';
  saleBottleneckStatus:
    | 'ID Card Not Uploaded'
    | 'Waiting for Admin ID Approval'
    | 'Verified — No Purchase Yet'
    | 'Project Purchased ✓';
  joinedAt: string;
}

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

function formatCurrency(value: number | undefined | null, currency = 'INR') {
  const num = typeof value === 'number' && !isNaN(value) ? value : Number(value) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num);
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
    description: 'Students who registered directly with your personal Referral Code.'
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

function createDefaultDashboard(studentId?: string, referralCode?: string): StudentReferralDashboard {
  const code = String(referralCode || studentId || 'STU-REF');
  const id = String(studentId || referralCode || 'STU-2026-0001');
  return {
    student_id: id,
    referral_id: 8402,
    referral_code: code,
    status: 'ACTIVE',
    referral_link: typeof window !== 'undefined'
      ? `${window.location.origin}/register?ref=${code}`
      : `https://unikart.com/register?ref=${code}`,
    total_successful_referrals: 0,
    pending_referrals: 0,
    eligible_rewards: 0,
    paid_rewards: 0,
    history: []
  };
}

function StudentReferralPageContent({
  accessToken,
  onSessionExpired,
  onLogin,
  studentId = 'STU-2026-0001',
  studentName = 'Janki',
  studentMobile = '',
  referralCode = '',
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

  // 4-Level Team Tree State (Unlimited Legs, Max 4 Levels)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedTabLevel, setSelectedTabLevel] = useState<'ALL' | '1' | '2' | '3' | '4'>('ALL');
  const [teamSearch, setTeamSearch] = useState<string>('');

  useEffect(() => {
    let active = true;

    const loadLiveReferralData = async () => {
      setLoading(true);
      setError('');
      const effectiveCode = String(referralCode || studentId || '').trim();
      const effectiveId = String(studentId || referralCode || '').trim();

      if (!effectiveCode && !effectiveId) {
        setLoading(false);
        return;
      }

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

        // 2. Query Supabase for real live referrals, orders, payouts, verifications, and meetings
        let refRows: any[] = [];
        let orderRows: any[] = [];
        let payoutRows: any[] = [];
        let verifRows: any[] = [];
        let meetRows: any[] = [];

        try {
          const [refSettled, orderSettled, payoutSettled, verifSettled, meetSettled] = await Promise.allSettled([
            supabase.from('referrals').select('*').order('created_at', { ascending: false }),
            supabase.from('orders').select('*').order('created_at', { ascending: false }),
            supabase.from('payouts').select('*').order('created_at', { ascending: false }),
            supabase.from('verifications').select('*').order('created_at', { ascending: false }),
            supabase.from('meetings').select('*').order('created_at', { ascending: false })
          ]);

          if (refSettled.status === 'fulfilled' && !refSettled.value.error && Array.isArray(refSettled.value.data)) {
            refRows = refSettled.value.data;
          }
          if (orderSettled.status === 'fulfilled' && !orderSettled.value.error && Array.isArray(orderSettled.value.data)) {
            orderRows = orderSettled.value.data;
          }
          if (payoutSettled.status === 'fulfilled' && !payoutSettled.value.error && Array.isArray(payoutSettled.value.data)) {
            const rawPayouts = payoutSettled.value.data;
            const targetCode = effectiveCode.toLowerCase();
            const targetId = effectiveId.toLowerCase();
            payoutRows = rawPayouts.filter((p: any) => {
              if (!p) return false;
              const pCode = String(p.referral_code || '').toLowerCase().trim();
              const pId = String(p.student_id || '').toLowerCase().trim();
              return (targetCode && pCode === targetCode) || (targetId && pId === targetId);
            });
          }
          if (verifSettled.status === 'fulfilled' && !verifSettled.value.error && Array.isArray(verifSettled.value.data)) {
            verifRows = verifSettled.value.data;
          }
          if (meetSettled.status === 'fulfilled' && !meetSettled.value.error && Array.isArray(meetSettled.value.data)) {
            meetRows = meetSettled.value.data;
          }
        } catch (queryErr) {
          console.warn('Supabase offline or schema unavailable:', queryErr);
        }

        // Incorporate local verification queue if any
        try {
          const rawLocalQueue = localStorage.getItem('cpm_verification_queue') || localStorage.getItem('cpm_verifications');
          if (rawLocalQueue) {
            const parsed = JSON.parse(rawLocalQueue);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && !verifRows.some((v) => String(v?.id || '') === String(item.id || '') || (v?.user_id && String(v.user_id) === String(item.user_id)))) {
                  verifRows.push(item);
                }
              }
            }
          }
        } catch {
          /* ignore */
        }

        if (!active) return;

        // 3. Map verifications by student ID, user ID, and email for fast lookup
        const verifMap = new Map<string, any>();
        for (const v of verifRows) {
          if (!v) continue;
          if (v.student_id_code) verifMap.set(String(v.student_id_code).toLowerCase().trim(), v);
          if (v.user_id) verifMap.set(String(v.user_id).toLowerCase().trim(), v);
          if (v.email) verifMap.set(String(v.email).toLowerCase().trim(), v);
        }

        const getMemberVerifStatus = (v: any): 'Verified' | 'Pending Review' | 'Rejected' | 'ID Not Uploaded' => {
          if (!v) return 'ID Not Uploaded';
          const st = String(v.status || '').toUpperCase().trim();
          if (st === 'APPROVED' || st === 'VERIFIED') return 'Verified';
          if (st === 'REJECTED') return 'Rejected';
          if (st === 'PENDING' || st === 'RE-UPLOADED') return 'Pending Review';
          if (v.front_image_url || v.back_image_url || v.front_data_url || v.back_data_url) return 'Pending Review';
          return 'ID Not Uploaded';
        };

        const getMemberMeetingStatus = (stdId: string, email?: string): '5-Min Meet Booked' | 'Meet Scheduled' | 'No Meeting Yet' => {
          const sId = String(stdId || '').toLowerCase().trim();
          const eMail = String(email || '').toLowerCase().trim();
          const studentMeetings = (Array.isArray(meetRows) ? meetRows : []).filter((m: any) => {
            if (!m) return false;
            const mId = String(m.student_id || '').toLowerCase().trim();
            const mEmail = String(m.student_email || '').toLowerCase().trim();
            return (sId && mId === sId) || (eMail && mEmail === eMail);
          });
          if (studentMeetings.some((m: any) => String(m?.status || '').toUpperCase() === 'SCHEDULED')) return 'Meet Scheduled';
          if (studentMeetings.some((m: any) => String(m?.status || '').toUpperCase() === 'PENDING')) return '5-Min Meet Booked';
          return 'No Meeting Yet';
        };

        const getMemberSaleStatus = (
          stdId: string,
          verifStatus: 'Verified' | 'Pending Review' | 'Rejected' | 'ID Not Uploaded',
          email?: string
        ): 'ID Card Not Uploaded' | 'Waiting for Admin ID Approval' | 'Verified — No Purchase Yet' | 'Project Purchased ✓' => {
          const sId = String(stdId || '').toLowerCase().trim();
          const eMail = String(email || '').toLowerCase().trim();
          const hasPurchased = (Array.isArray(orderRows) ? orderRows : []).some((o: any) => {
            if (!o) return false;
            const oId = String(o.student_id || '').toLowerCase().trim();
            const oEmail = String(o.student_email || '').toLowerCase().trim();
            const matchesStudent = (sId && oId === sId) || (eMail && oEmail === eMail);
            const oStatus = String(o.status || '').toUpperCase();
            const pStatus = String(o.payment_status || '').toUpperCase();
            const isCompleted = oStatus === 'COMPLETED' || pStatus === 'PAID' || pStatus === 'COMPLETED';
            return matchesStudent && isCompleted;
          });

          if (hasPurchased) return 'Project Purchased ✓';
          if (verifStatus === 'ID Not Uploaded') return 'ID Card Not Uploaded';
          if (verifStatus === 'Pending Review' || verifStatus === 'Rejected') return 'Waiting for Admin ID Approval';
          return 'Verified — No Purchase Yet';
        };

        const buildTeamMember = (
          stdId: string,
          studentNameFallback: string,
          level: 1 | 2 | 3 | 4,
          referredByName: string,
          referredById: string,
          joinedAtFallback: string
        ): TeamMember => {
          const safeStdId = String(stdId || '').trim();
          const v = safeStdId ? verifMap.get(safeStdId.toLowerCase()) : undefined;
          const studentName = String(v?.student_name || studentNameFallback || (safeStdId ? `Student ${safeStdId.slice(-4)}` : 'Student Peer')).trim();
          const collegeName = String(v?.college || 'College').trim();
          const verifStatus = getMemberVerifStatus(v);
          const meetStatus = getMemberMeetingStatus(safeStdId, v?.email);
          const saleStatus = getMemberSaleStatus(safeStdId, verifStatus, v?.email);

          return {
            id: `${safeStdId || 'std'}-lvl${level}-${Math.random().toString(36).substring(2, 7)}`,
            studentId: safeStdId || 'STU-0000',
            studentName: studentName || 'Student Peer',
            collegeName: collegeName || 'College',
            level,
            type: level === 1 ? 'Direct' : 'Indirect',
            referredByName: String(referredByName || (level === 1 ? 'Direct (You)' : 'Peer Referral')),
            referredById: String(referredById || ''),
            verificationStatus: verifStatus,
            meetingStatus: meetStatus,
            saleBottleneckStatus: saleStatus,
            joinedAt: String(v?.submitted_at || v?.created_at || joinedAtFallback || new Date().toISOString())
          };
        };

        // 4. Multi-level Graph Traversal: Max 4 levels, unlimited legs
        const visited = new Set<string>();
        const rootCodes = [effectiveCode, effectiveId].map((s) => String(s || '').toLowerCase().trim()).filter(Boolean);
        for (const rc of rootCodes) visited.add(rc);

        const findReferredCandidates = (inviterCodes: string[]) => {
          const candidates: { studentId: string; studentName: string; joinedAt: string; inviterCode: string }[] = [];
          const lowerInviterCodes = new Set(inviterCodes.map((c) => String(c || '').toLowerCase().trim()).filter(Boolean));

          for (const r of refRows) {
            if (!r) continue;
            const rRefCode = String(r.referral_code || '').toLowerCase().trim();
            const rRefId = String(r.referrer_student_id || '').toLowerCase().trim();
            const candidateId = String(r.referred_student_id || '').trim();

            if ((lowerInviterCodes.has(rRefCode) || lowerInviterCodes.has(rRefId)) && candidateId) {
              if (!visited.has(candidateId.toLowerCase()) && !candidates.some((c) => c.studentId.toLowerCase() === candidateId.toLowerCase())) {
                candidates.push({
                  studentId: candidateId,
                  studentName: String(r.referred_student_name || '').trim(),
                  joinedAt: String(r.created_at || ''),
                  inviterCode: rRefCode || rRefId
                });
              }
            }
          }

          for (const v of verifRows) {
            if (!v) continue;
            const vRefCode = String(v.referral_code || '').toLowerCase().trim();
            const candidateId = String(v.student_id_code || '').trim();

            if (lowerInviterCodes.has(vRefCode) && candidateId && candidateId.toLowerCase() !== vRefCode) {
              if (!visited.has(candidateId.toLowerCase()) && !candidates.some((c) => c.studentId.toLowerCase() === candidateId.toLowerCase())) {
                candidates.push({
                  studentId: candidateId,
                  studentName: String(v.student_name || '').trim(),
                  joinedAt: String(v.submitted_at || v.created_at || ''),
                  inviterCode: vRefCode
                });
              }
            }
          }

          return candidates;
        };

        // Level 1: Direct Classmates
        const lvl1Cands = findReferredCandidates(rootCodes);
        const lvl1Members: TeamMember[] = [];
        for (const cand of lvl1Cands) {
          const safeId = String(cand.studentId || '').trim();
          if (!safeId) continue;
          visited.add(safeId.toLowerCase());
          lvl1Members.push(
            buildTeamMember(safeId, cand.studentName, 1, 'Direct (You)', effectiveId, cand.joinedAt)
          );
        }

        // Level 2: Peer Invites (invited by Level 1 members)
        const lvl2Members: TeamMember[] = [];
        for (const m1 of lvl1Members) {
          if (!m1) continue;
          const m1Codes = [String(m1.studentId || '').trim()].filter(Boolean);
          const v = verifMap.get(String(m1.studentId || '').toLowerCase().trim());
          if (v?.referral_code) {
            const safeRef = String(v.referral_code).trim();
            if (safeRef && safeRef !== m1.studentId) m1Codes.push(safeRef);
          }

          const lvl2Cands = findReferredCandidates(m1Codes);
          for (const cand of lvl2Cands) {
            const safeId = String(cand.studentId || '').trim();
            if (!safeId) continue;
            visited.add(safeId.toLowerCase());
            lvl2Members.push(
              buildTeamMember(safeId, cand.studentName, 2, m1.studentName, m1.studentId, cand.joinedAt)
            );
          }
        }

        // Level 3: Department Network (invited by Level 2 members)
        const lvl3Members: TeamMember[] = [];
        for (const m2 of lvl2Members) {
          if (!m2) continue;
          const m2Codes = [String(m2.studentId || '').trim()].filter(Boolean);
          const v = verifMap.get(String(m2.studentId || '').toLowerCase().trim());
          if (v?.referral_code) {
            const safeRef = String(v.referral_code).trim();
            if (safeRef && safeRef !== m2.studentId) m2Codes.push(safeRef);
          }

          const lvl3Cands = findReferredCandidates(m2Codes);
          for (const cand of lvl3Cands) {
            const safeId = String(cand.studentId || '').trim();
            if (!safeId) continue;
            visited.add(safeId.toLowerCase());
            lvl3Members.push(
              buildTeamMember(safeId, cand.studentName, 3, m2.studentName, m2.studentId, cand.joinedAt)
            );
          }
        }

        // Level 4: Campus Community (invited by Level 3 members)
        const lvl4Members: TeamMember[] = [];
        for (const m3 of lvl3Members) {
          if (!m3) continue;
          const m3Codes = [String(m3.studentId || '').trim()].filter(Boolean);
          const v = verifMap.get(String(m3.studentId || '').toLowerCase().trim());
          if (v?.referral_code) {
            const safeRef = String(v.referral_code).trim();
            if (safeRef && safeRef !== m3.studentId) m3Codes.push(safeRef);
          }

          const lvl4Cands = findReferredCandidates(m3Codes);
          for (const cand of lvl4Cands) {
            const safeId = String(cand.studentId || '').trim();
            if (!safeId) continue;
            visited.add(safeId.toLowerCase());
            lvl4Members.push(
              buildTeamMember(safeId, cand.studentName, 4, m3.studentName, m3.studentId, cand.joinedAt)
            );
          }
        }

        const allLiveTeamMembers = [...lvl1Members, ...lvl2Members, ...lvl3Members, ...lvl4Members];
        setTeamMembers(allLiveTeamMembers);

        // 5. Merge real records into live attribution history
        const historyMap = new Map<number, StudentReferralHistoryItem>();

        // Incorporate backend data if any
        if (backendData?.history && Array.isArray(backendData.history)) {
          for (const item of backendData.history) {
            if (item && typeof item.id === 'number') {
              historyMap.set(item.id, item);
            }
          }
        }

        // Incorporate Supabase referrals
        for (const r of refRows) {
          if (!r) continue;
          const id = Number(r.id) || Math.floor(Math.random() * 100000);
          const rStatus = String(r.status || '').toUpperCase();
          const rewStatus = String(r.reward_status || '').toUpperCase();
          const isCompleted = rStatus === 'SUCCESSFUL' || rStatus === 'COMPLETED' || rewStatus === 'PAID';
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
          if (!o) continue;
          const orderId = Number(o.id) || 0;
          const alreadyExists = Array.from(historyMap.values()).some((h) => h.order_id === orderId);
          if (!alreadyExists && orderId > 0) {
            const syntheticId = 1000 + orderId;
            const oStatus = String(o.status || '').toUpperCase();
            const pStatus = String(o.payment_status || '').toUpperCase();
            const isPaid = oStatus === 'COMPLETED' || pStatus === 'PAID' || pStatus === 'COMPLETED';
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

        // 6. Calculate summary counters strictly from live data
        const totalSuccessful = liveHistory.filter(
          (h) => h && (h.status === 'COMPLETED' || h.status === 'SUCCESSFUL' || h.reward_status === 'PAID')
        ).length;

        const pendingReferrals = liveHistory.filter(
          (h) => h && (h.status === 'PENDING' || h.status === 'PENDING_QUALIFYING_PURCHASE' || h.status === 'REGISTERED')
        ).length;

        const eligibleRewards = liveHistory
          .filter((h) => h && (h.reward_status === 'ELIGIBLE' || (h.status === 'COMPLETED' && h.reward_status !== 'PAID')))
          .reduce((sum, h) => sum + (Number(h.reward_amount) || 0), 0);

        const paidRewards = liveHistory
          .filter((h) => h && (h.reward_status === 'PAID' || h.reward_status === 'SETTLED'))
          .reduce((sum, h) => sum + (Number(h.reward_amount) || 0), 0);

        // 7. Calculate Level 1-4 stats strictly from live data
        const updatedLevelStats = BASE_LEVEL_CONFIG.map((tier) => {
          const tierMembers = allLiveTeamMembers.filter((m) => m && m.level === tier.level);
          const activeStudents = tierMembers.length;
          const purchasedStudents = tierMembers.filter((m) => m && m.saleBottleneckStatus === 'Project Purchased ✓').length;
          let tierEarnings = purchasedStudents * tier.ratePerSale;

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

        // 8. Calculate Payout ledger strictly from live data (Supabase + Local Cache)
        let livePayouts: ReferralPayoutRecord[] = [];
        try {
          const payoutItems = await StudentPayoutAPI.list(effectiveId, effectiveCode);
          if (Array.isArray(payoutItems) && payoutItems.length > 0) {
            livePayouts = payoutItems.map((p) => ({
              id: String(p.payout_id || `PAY-${Math.random().toString(36).substring(2, 6)}`),
              date: p.created_at
                ? new Date(p.created_at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Recent',
              amount: Number(p.amount || 0),
              paymentMode: p.payment_method === 'UPI' ? 'UPI Transfer' : 'Bank NEFT Transfer',
              account: p.payment_method === 'UPI'
                ? (p.upi_id || 'UPI VPA')
                : `${p.bank_account ? `A/C ••••${String(p.bank_account).slice(-4)}` : 'Bank A/C'} (${p.ifsc_code || ''})`,
              status: p.status === 'PAID' ? 'PAID' : (p.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING'),
              utrRef: p.utr_ref || (p.status === 'PAID' ? 'Settled' : 'Processing (Within 20 Hours)')
            }));
          }
        } catch {
          /* fallback to empty payouts */
        }
        setPayouts(livePayouts);

        // 9. Update Dashboard state
        setDashboard({
          student_id: effectiveId,
          referral_id: backendData?.referral_id || 8402,
          referral_code: effectiveCode,
          status: 'ACTIVE',
          referral_link: typeof window !== 'undefined'
            ? `${window.location.origin}/register?ref=${effectiveCode}`
            : `https://unikart.com/register?ref=${effectiveCode}`,
          total_successful_referrals: totalSuccessful || 0,
          pending_referrals: pendingReferrals || 0,
          eligible_rewards: eligibleRewards || 0,
          paid_rewards: paidRewards || 0,
          history: liveHistory || []
        });
      } catch (err) {
        if (!active) return;
        console.error('Referral data load error caught safely:', err);
        setError(err instanceof Error ? err.message : 'Unable to load live referral data.');
        setDashboard(createDefaultDashboard(effectiveId, effectiveCode));
        setLevelStats(createInitialLevelStats());
        setTeamMembers([]);
        setPayouts([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLiveReferralData();

    // Realtime Supabase Subscription: Auto-update on new referrals, orders, verifications, meetings, or payouts
    try {
      const channel = supabase
        .channel(`unikart-referral-live-${referralCode || studentId || 'isolated'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, () => {
          void loadLiveReferralData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          void loadLiveReferralData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, () => {
          void loadLiveReferralData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
          void loadLiveReferralData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => {
          void loadLiveReferralData();
        })
        .subscribe();

      return () => {
        active = false;
        try {
          void supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      };
    } catch {
      return () => {
        active = false;
      };
    }
  }, [accessToken, onSessionExpired, retry, studentId, referralCode]);

  // 4-Level Team Tree Memoized Computations (Strictly at top before any returns)
  const safeTeamMembers = useMemo(() => (Array.isArray(teamMembers) ? teamMembers : []), [teamMembers]);
  const level1Members = useMemo(() => safeTeamMembers.filter((m) => m && m.level === 1), [safeTeamMembers]);
  const level2Members = useMemo(() => safeTeamMembers.filter((m) => m && m.level === 2), [safeTeamMembers]);
  const level3Members = useMemo(() => safeTeamMembers.filter((m) => m && m.level === 3), [safeTeamMembers]);
  const level4Members = useMemo(() => safeTeamMembers.filter((m) => m && m.level === 4), [safeTeamMembers]);

  const directVerified = useMemo(
    () => level1Members.filter((m) => m && m.verificationStatus === 'Verified').length,
    [level1Members]
  );

  const indirectVerified = useMemo(
    () => safeTeamMembers.filter((m) => m && m.level >= 2 && m.verificationStatus === 'Verified').length,
    [safeTeamMembers]
  );

  const actionNeededCount = useMemo(
    () => safeTeamMembers.filter((m) => m && m.verificationStatus !== 'Verified').length,
    [safeTeamMembers]
  );

  const totalSalesCount = useMemo(
    () => safeTeamMembers.filter((m) => m && m.saleBottleneckStatus === 'Project Purchased ✓').length,
    [safeTeamMembers]
  );

  const filteredMembers = useMemo(() => {
    return safeTeamMembers.filter((m) => {
      if (!m) return false;
      const matchesLevel = selectedTabLevel === 'ALL' || String(m.level) === selectedTabLevel;
      const q = String(teamSearch || '').toLowerCase().trim();
      if (!q) return matchesLevel;
      const sName = String(m.studentName || '').toLowerCase();
      const sId = String(m.studentId || '').toLowerCase();
      const cName = String(m.collegeName || '').toLowerCase();
      const refBy = String(m.referredByName || '').toLowerCase();
      const matchesSearch =
        sName.includes(q) ||
        sId.includes(q) ||
        cName.includes(q) ||
        refBy.includes(q);
      return matchesLevel && matchesSearch;
    });
  }, [safeTeamMembers, selectedTabLevel, teamSearch]);

  const share = async () => {
    if (!dashboard) return;
    setMessage('');
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join Unikart with Referral Code ${dashboard.referral_code}`,
          text: `Explore verified college projects on Unikart! Use my Referral Code ${dashboard.referral_code}:`,
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
      setMessage(`Referral Code ${dashboard.referral_code} copied!`);
      onToast?.(`Referral Code ${dashboard.referral_code} copied!`, 'success');
    } catch {
      onToast?.('Unable to copy referral code.', 'error');
    }
  };

  const refresh = () => {
    setError('');
    setLoading(true);
    setRetry((value) => value + 1);
  };

  // Safe dashboard and derived variables
  const safeDashboard = dashboard || createDefaultDashboard(studentId, referralCode);
  const effectiveCode = String(safeDashboard.referral_code || referralCode || studentId || '').trim();
  const effectiveStudentId = String(safeDashboard.student_id || studentId || '').trim();
  const effectiveLink = safeDashboard.referral_link || `https://unikart.com/register?ref=${effectiveCode}`;

  const safeLevelStats = Array.isArray(levelStats) ? levelStats : [];
  const totalNetworkEarnings = safeLevelStats.reduce((sum, tier) => sum + (Number(tier?.totalEarnings) || 0), 0);

  // Pending withdrawals hold and available withdrawal balance
  const safePayouts = Array.isArray(payouts) ? payouts : [];
  const pendingWithdrawalTotal = safePayouts
    .filter((p) => p && (p.status === 'PENDING' || p.status === 'PROCESSING'))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const eligibleRewardsAmt = Number(safeDashboard.eligible_rewards) || 0;
  const availableBalance = Math.max(0, eligibleRewardsAmt - pendingWithdrawalTotal);

  const directTotal = level1Members.length;
  const indirectTotal = level2Members.length + level3Members.length + level4Members.length;
  const level1Referrals = directTotal;
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

  // Early returns strictly AFTER ALL hooks and calculations have executed
  if (loading) {
    return (
      <div aria-label="Loading referral data" className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center">
        <UnikartLoader message="Loading referral network team & reward tiers..." size="md" />
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">Permanent Referral Code</p>
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
                ? 'Unlockable after achieving at least 1 Level 1 referral. Share your Referral Code to get direct classmates to register and purchase.'
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
          4-Level Team Network (Levels 1–4)
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

      {/* TAB 1: LIVE 4-LEVEL TEAM NETWORK (LEVELS 1-4) */}
      {activeTab === 'levels' && (
        <section className="space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/60 p-5 rounded-2xl border border-indigo-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-black text-[11px] uppercase tracking-wider">
                  Live Network
                </span>
                <h3 className="text-base font-extrabold text-slate-900">4-Level Team Network (Unlimited Legs, Max 4 Levels)</h3>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Live hierarchy of your student referrals. Track ID verification, 5-minute meeting activity, and purchase milestones across 4 generations deep.
              </p>
            </div>
            <div className="text-xs font-semibold text-indigo-700 bg-white px-3.5 py-2 rounded-xl border border-indigo-200 shadow-2xs shrink-0">
              Total Network Earnings: <strong className="text-emerald-700 font-extrabold">{formatCurrency(totalNetworkEarnings)}</strong>
            </div>
          </div>

          {/* 4 Live Summary Counter Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Direct Registered (Level 1) */}
            <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Direct Registered (Level 1)</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{directTotal}</span>
                <span className="text-xs text-slate-400 font-medium">Students</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                  <CheckCircle2 size={12} /> {directVerified} Verified
                </span>
                <span className="text-slate-400 text-[11px]">({directTotal - directVerified} unverified)</span>
              </div>
            </div>

            {/* Card 2: Indirect Registered (Levels 2–4) */}
            <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Indirect Registered (Levels 2–4)</span>
                <Layers className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{indirectTotal}</span>
                <span className="text-xs text-slate-400 font-medium">Students</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                  <CheckCircle2 size={12} /> {indirectVerified} Verified
                </span>
                <span className="text-slate-400 text-[11px]">({indirectTotal - indirectVerified} unverified)</span>
              </div>
            </div>

            {/* Card 3: Action Needed (Unverified / Pending ID) */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                <span>Action Needed (Unverified / Pending ID)</span>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-900">{actionNeededCount}</span>
                <span className="text-xs text-amber-700 font-medium">Need Verification</span>
              </div>
              <p className="mt-2 text-[11px] text-amber-700 font-medium">
                Pending student ID upload or admin ID review
              </p>
            </div>

            {/* Card 4: Total Team Sales */}
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>Total Team Sales</span>
                <Award className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-900">{totalSalesCount}</span>
                <span className="text-xs text-emerald-700 font-medium">Purchased</span>
              </div>
              <p className="mt-2 text-[11px] text-emerald-700 font-medium">
                Completed paid project purchases in your team
              </p>
            </div>
          </div>

          {/* Level Filter Tabs & Team Members Directory */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {/* Header with Level Filter Tabs */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60">
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  Team Members Directory
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Privacy-safe roster (unlimited legs per level, strictly up to Level 4)
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
                {[
                  { id: 'ALL', label: 'All Levels (1–4)', count: teamMembers.length },
                  { id: '1', label: 'Level 1 (Direct)', count: level1Members.length },
                  { id: '2', label: 'Level 2', count: level2Members.length },
                  { id: '3', label: 'Level 3', count: level3Members.length },
                  { id: '4', label: 'Level 4', count: level4Members.length }
                ].map((tab) => {
                  const isSelected = selectedTabLevel === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedTabLevel(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Bar & Summary Count */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div className="text-xs text-slate-500">
                Showing <strong>{filteredMembers.length}</strong> team member{filteredMembers.length === 1 ? '' : 's'}
                {selectedTabLevel !== 'ALL' && <span> in Level {selectedTabLevel}</span>}
              </div>

              <div className="relative min-w-[240px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search by student name, ID, college..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Privacy-Safe Team Member List */}
            {filteredMembers.length === 0 ? (
              <div className="py-14 px-5 text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-900">
                  {teamSearch
                    ? 'No team members match your search'
                    : selectedTabLevel === 'ALL'
                    ? 'No team members registered under your referral link yet'
                    : `No team members in Level ${selectedTabLevel} yet`}
                </h4>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {selectedTabLevel === '1' || selectedTabLevel === 'ALL'
                    ? 'Share your personal Referral Code with college classmates to start building your direct Level 1 team.'
                    : `When your Level ${Number(selectedTabLevel) - 1} team members invite classmates, they will automatically appear here as Level ${selectedTabLevel} referrals.`}
                </p>
                {(selectedTabLevel === '1' || selectedTabLevel === 'ALL') && !teamSearch && (
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
                <table className="w-full text-left text-xs min-w-[820px]">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200 text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Level & Type</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Student ID & College</th>
                      <th className="py-3 px-4">Referred By</th>
                      <th className="py-3 px-4">ID Verification</th>
                      <th className="py-3 px-4">Activity Progress</th>
                      <th className="py-3 px-4">Sale / Bottleneck Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* 1. Level & Type Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              m.level === 1
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : m.level === 2
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : m.level === 3
                                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            Level {m.level} • {m.type}
                          </span>
                        </td>

                        {/* 2. Student Name */}
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {m.studentName}
                        </td>

                        {/* 3. Student ID & College Name */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 text-[11px]">
                              {m.studentId}
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="font-medium text-slate-700">{m.collegeName}</span>
                          </div>
                        </td>

                        {/* 4. Referred By */}
                        <td className="py-3.5 px-4">
                          {m.level === 1 ? (
                            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              Direct (You)
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-700">
                              {m.referredByName}
                            </span>
                          )}
                        </td>

                        {/* 5. ID Verification Status */}
                        <td className="py-3.5 px-4">
                          {m.verificationStatus === 'Verified' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 size={12} /> Verified ✓
                            </span>
                          ) : m.verificationStatus === 'Pending Review' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                              <Clock size={12} /> Pending Review
                            </span>
                          ) : m.verificationStatus === 'Rejected' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                              <X size={12} /> Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                              ID Not Uploaded
                            </span>
                          )}
                        </td>

                        {/* 6. Activity Progress */}
                        <td className="py-3.5 px-4">
                          {m.meetingStatus === 'Meet Scheduled' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              Meet Scheduled
                            </span>
                          ) : m.meetingStatus === '5-Min Meet Booked' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
                              5-Min Meet Booked
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">
                              No Meeting Yet
                            </span>
                          )}
                        </td>

                        {/* 7. Sale / Bottleneck Status */}
                        <td className="py-3.5 px-4">
                          {m.saleBottleneckStatus === 'Project Purchased ✓' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              Project Purchased ✓
                            </span>
                          ) : m.saleBottleneckStatus === 'Verified — No Purchase Yet' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                              Verified — No Purchase Yet
                            </span>
                          ) : m.saleBottleneckStatus === 'Waiting for Admin ID Approval' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                              Waiting for Admin ID Approval
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                              ID Card Not Uploaded
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

          {payouts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
              <CreditCard className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-800">No payout settlements yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No referral activity yet. Share your Referral Code to start earning! Payout settlements are automatically disbursed to your verified UPI account once students complete verified project purchases.
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

          {safeDashboard.history.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-800">No qualifying orders yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No referral activity yet. Share your Referral Code to start earning! When students register and purchase verified projects with your code, their qualifying orders will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {safeDashboard.history.map((item) => (
                <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/50">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Attribution Record #{item.id}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}</p>
                    {item.order_id !== null && item.order_id !== undefined && (
                      <p className="mt-1 text-xs text-indigo-600 font-semibold flex items-center gap-1">
                        Qualifying Order #{item.order_id} <ArrowRight size={12} />
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {item.reward_amount !== null && item.reward_amount !== undefined && (
                      <span className="text-sm font-mono font-extrabold text-slate-900">
                        {formatCurrency(item.reward_amount, item.reward_currency || 'INR')}
                      </span>
                    )}
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                      {String(item.reward_status || item.status || 'PENDING').replaceAll('_', ' ')}
                    </span>
                    {item.reward_status === 'PAID' && <Check size={16} className="text-emerald-600" />}
                    {item.order_id !== null && item.order_id !== undefined && <ExternalLink size={14} className="text-slate-400" />}
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

export default function StudentReferralPage(props: StudentReferralPageProps) {
  return (
    <ReferralErrorBoundary>
      <StudentReferralPageContent {...props} />
    </ReferralErrorBoundary>
  );
}
