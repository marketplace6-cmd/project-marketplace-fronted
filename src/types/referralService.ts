import { verificationApiBaseUrl } from './verificationService';
import { supabase } from '../utils/supabase/client';

export interface StudentReferralHistoryItem {
  id: number;
  status: string;
  created_at: string;
  order_id: number | null;
  reward_amount: number | null;
  reward_currency: string | null;
  reward_status: string | null;
}

export interface StudentReferralDashboard {
  student_id: string | null;
  referral_id: number;
  referral_code: string;
  status: string;
  referral_link: string;
  total_successful_referrals: number;
  pending_referrals: number;
  eligible_rewards: number;
  paid_rewards: number;
  history: StudentReferralHistoryItem[];
}

export interface AdminReferralRecord {
  id: number;
  attribution_id: number | null;
  referral_code: string;
  status: string;
  created_at: string;
  referrer_student_id: string | null;
  referred_student_id: string | null;
  order_id: number | null;
  reward_amount: number | null;
  reward_currency: string | null;
  reward_status: string | null;
}

export interface AdminReferralPageResult {
  items: AdminReferralRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminReferralReward {
  id: number;
  order_id: number;
  eligible_amount: number;
  reward_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface AdminReferralAttribution {
  id: number | null;
  referred_student_id: string | null;
  status: string;
  created_at: string;
  reward_history: AdminReferralReward[];
}

export interface AdminReferralDetail {
  id: number;
  referrer_student_id: string | null;
  referral_code: string;
  status: string;
  created_at: string;
  attributions: AdminReferralAttribution[];
  reward_history: AdminReferralReward[];
}

export class ReferralApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ReferralApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

async function parseResponse(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ReferralApiError(
      response.ok ? 'Referral service returned an invalid response.' : `Request failed (${response.status})`,
      response.ok ? 502 : response.status
    );
  }
  if (!response.ok) {
    const message = isRecord(body) && typeof body.detail === 'string'
      ? body.detail
      : `Request failed (${response.status})`;
    throw new ReferralApiError(message, response.status);
  }
  return body;
}

async function request(path: string, accessToken?: string): Promise<unknown> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (accessToken) headers.set('Authorization', `******`);
  return parseResponse(await fetch(`${verificationApiBaseUrl}${path}`, {
    headers,
    cache: 'no-store'
  }));
}

function parseHistoryItem(value: unknown): value is StudentReferralHistoryItem {
  return isRecord(value)
    && typeof value.id === 'number'
    && typeof value.status === 'string'
    && typeof value.created_at === 'string'
    && nullableNumber(value.order_id)
    && nullableNumber(value.reward_amount)
    && nullableString(value.reward_currency)
    && nullableString(value.reward_status);
}

function parseStudentDashboard(value: unknown): StudentReferralDashboard {
  if (
    !isRecord(value)
    || !nullableString(value.student_id)
    || typeof value.referral_id !== 'number'
    || typeof value.referral_code !== 'string'
    || typeof value.status !== 'string'
    || typeof value.referral_link !== 'string'
    || typeof value.total_successful_referrals !== 'number'
    || typeof value.pending_referrals !== 'number'
    || typeof value.eligible_rewards !== 'number'
    || typeof value.paid_rewards !== 'number'
    || !Array.isArray(value.history)
    || !value.history.every(parseHistoryItem)
  ) {
    throw new ReferralApiError('Referral dashboard response is invalid.', 502);
  }
  return value as StudentReferralDashboard;
}

function parseReward(value: unknown): value is AdminReferralReward {
  return isRecord(value)
    && typeof value.id === 'number'
    && typeof value.order_id === 'number'
    && typeof value.eligible_amount === 'number'
    && typeof value.reward_amount === 'number'
    && typeof value.currency === 'string'
    && typeof value.status === 'string'
    && typeof value.created_at === 'string';
}

function parseAdminReferralRecord(value: unknown): value is AdminReferralRecord {
  return isRecord(value)
    && typeof value.id === 'number'
    && nullableNumber(value.attribution_id)
    && typeof value.referral_code === 'string'
    && typeof value.status === 'string'
    && typeof value.created_at === 'string'
    && nullableString(value.referrer_student_id)
    && nullableString(value.referred_student_id)
    && nullableNumber(value.order_id)
    && nullableNumber(value.reward_amount)
    && nullableString(value.reward_currency)
    && nullableString(value.reward_status);
}

function parseAdminPage(value: unknown): AdminReferralPageResult {
  if (
    !isRecord(value)
    || !Array.isArray(value.items)
    || !value.items.every(parseAdminReferralRecord)
    || typeof value.total !== 'number'
    || typeof value.page !== 'number'
    || typeof value.page_size !== 'number'
  ) {
    throw new ReferralApiError('Admin referral list response is invalid.', 502);
  }
  return value as AdminReferralPageResult;
}

function parseAdminDetail(value: unknown): AdminReferralDetail {
  if (
    !isRecord(value)
    || typeof value.id !== 'number'
    || !nullableString(value.referrer_student_id)
    || typeof value.referral_code !== 'string'
    || typeof value.status !== 'string'
    || typeof value.created_at !== 'string'
    || !Array.isArray(value.attributions)
    || !value.attributions.every((attribution) =>
      isRecord(attribution)
      && nullableNumber(attribution.id)
      && nullableString(attribution.referred_student_id)
      && typeof attribution.status === 'string'
      && typeof attribution.created_at === 'string'
      && Array.isArray(attribution.reward_history)
      && attribution.reward_history.every(parseReward))
    || !Array.isArray(value.reward_history)
    || !value.reward_history.every(parseReward)
  ) {
    throw new ReferralApiError('Admin referral detail response is invalid.', 502);
  }
  return value as AdminReferralDetail;
}

export const StudentReferralAPI = {
  async validateCode(code: string): Promise<boolean> {
    const result = await request(`/referrals/validate/${encodeURIComponent(code)}`);
    if (!isRecord(result) || typeof result.valid !== 'boolean') {
      throw new ReferralApiError('Referral validation response is invalid.', 502);
    }
    return result.valid;
  },

  async getMine(accessToken: string): Promise<StudentReferralDashboard> {
    return parseStudentDashboard(await request('/referrals/me', accessToken));
  }
};

export const AdminReferralAPI = {
  async list(
    accessToken: string,
    filters: { search: string; status: string; rewardStatus: string; page: number }
  ): Promise<AdminReferralPageResult> {
    try {
      const query = new URLSearchParams({ page: String(filters.page), page_size: '25' });
      if (filters.search.trim()) query.set('search', filters.search.trim());
      if (filters.status) query.set('status', filters.status);
      if (filters.rewardStatus) query.set('reward_status', filters.rewardStatus);
      return parseAdminPage(await request(`/admin/referrals?${query}`, accessToken));
    } catch {
      // Supabase fallback
      try {
        let sbQuery = supabase.from('referrals').select('*', { count: 'exact' });
        if (filters.status) sbQuery = sbQuery.eq('status', filters.status);
        if (filters.rewardStatus) sbQuery = sbQuery.eq('reward_status', filters.rewardStatus);
        if (filters.search.trim()) {
          sbQuery = sbQuery.or(`referral_code.ilike.%${filters.search.trim()}%,referrer_student_id.ilike.%${filters.search.trim()}%,referred_student_id.ilike.%${filters.search.trim()}%`);
        }
        const { data, count, error } = await sbQuery.order('id', { ascending: false });
        if (!error && data && data.length > 0) {
          const items: AdminReferralRecord[] = data.map((d: any) => ({
            id: Number(d.id),
            attribution_id: d.attribution_id ? Number(d.attribution_id) : null,
            referral_code: d.referral_code,
            status: d.status,
            created_at: d.created_at || new Date().toISOString(),
            referrer_student_id: d.referrer_student_id || null,
            referred_student_id: d.referred_student_id || null,
            order_id: d.order_id ? Number(d.order_id) : null,
            reward_amount: d.reward_amount ? Number(d.reward_amount) : null,
            reward_currency: d.reward_currency || 'INR',
            reward_status: d.reward_status || null
          }));
          return { items, total: count || items.length, page: filters.page, page_size: 25 };
        }
      } catch {
        /* proceed to empty */
      }
      return { items: [], total: 0, page: filters.page, page_size: 25 };
    }
  },

  async get(accessToken: string, referralId: number): Promise<AdminReferralDetail> {
    return parseAdminDetail(await request(`/admin/referrals/${referralId}`, accessToken));
  }
};

export interface WithdrawalRequestItem {
  id: string | number;
  payout_id: string;
  student_id: string;
  student_name?: string;
  referral_code: string;
  amount: number;
  currency?: string;
  payment_method: 'UPI' | 'BANK_TRANSFER';
  upi_id?: string;
  phone?: string;
  bank_account?: string;
  ifsc_code?: string;
  branch_name?: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'REJECTED';
  utr_ref?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export const StudentPayoutAPI = {
  loadLocalPayouts(): WithdrawalRequestItem[] {
    try {
      const raw = localStorage.getItem('cpm_payouts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveLocalPayouts(items: WithdrawalRequestItem[]): void {
    try {
      localStorage.setItem('cpm_payouts', JSON.stringify(items));
    } catch {
      /* ignore */
    }
  },

  async submitWithdrawal(data: Omit<WithdrawalRequestItem, 'id' | 'created_at' | 'updated_at'>): Promise<WithdrawalRequestItem> {
    const item: WithdrawalRequestItem = {
      ...data,
      id: data.payout_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. Save to local storage
    const current = StudentPayoutAPI.loadLocalPayouts();
    StudentPayoutAPI.saveLocalPayouts([item, ...current]);

    // 2. Save to Supabase
    try {
      await supabase.from('payouts').insert([{
        payout_id: item.payout_id,
        student_id: item.student_id,
        student_name: item.student_name,
        referral_code: item.referral_code,
        amount: item.amount,
        currency: item.currency || 'INR',
        payment_method: item.payment_method,
        upi_id: item.upi_id,
        phone: item.phone,
        bank_account: item.bank_account,
        ifsc_code: item.ifsc_code,
        branch_name: item.branch_name,
        status: 'PENDING',
        utr_ref: item.utr_ref || 'Processing (Within 20 Hours)',
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at
      }]);
    } catch {
      /* ignore Supabase error, local persistence ensures resilience */
    }

    return item;
  },

  async list(studentId: string, referralCode: string): Promise<WithdrawalRequestItem[]> {
    let sbItems: WithdrawalRequestItem[] = [];
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select('*')
        .or(`referral_code.eq.${referralCode},student_id.eq.${studentId}`)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        sbItems = data.map((d: any) => ({
          id: d.id || d.payout_id,
          payout_id: d.payout_id || `PAY-${d.id}`,
          student_id: d.student_id,
          student_name: d.student_name,
          referral_code: d.referral_code,
          amount: Number(d.amount),
          currency: d.currency || 'INR',
          payment_method: d.payment_method || 'UPI',
          upi_id: d.upi_id,
          phone: d.phone,
          bank_account: d.bank_account,
          ifsc_code: d.ifsc_code,
          branch_name: d.branch_name,
          status: d.status,
          utr_ref: d.utr_ref,
          notes: d.notes,
          created_at: d.created_at,
          updated_at: d.updated_at
        }));
      }
    } catch {
      /* ignore */
    }

    const localItems = StudentPayoutAPI.loadLocalPayouts().filter(
      (p) => p.referral_code === referralCode || p.student_id === studentId
    );

    const map = new Map<string, WithdrawalRequestItem>();
    for (const item of localItems) map.set(item.payout_id, item);
    for (const item of sbItems) map.set(item.payout_id, item);

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
};

export const AdminPayoutAPI = {
  async listAll(): Promise<WithdrawalRequestItem[]> {
    let sbItems: WithdrawalRequestItem[] = [];
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        sbItems = data.map((d: any) => ({
          id: d.id || d.payout_id,
          payout_id: d.payout_id || `PAY-${d.id}`,
          student_id: d.student_id,
          student_name: d.student_name,
          referral_code: d.referral_code,
          amount: Number(d.amount),
          currency: d.currency || 'INR',
          payment_method: d.payment_method || 'UPI',
          upi_id: d.upi_id,
          phone: d.phone,
          bank_account: d.bank_account,
          ifsc_code: d.ifsc_code,
          branch_name: d.branch_name,
          status: d.status,
          utr_ref: d.utr_ref,
          notes: d.notes,
          created_at: d.created_at,
          updated_at: d.updated_at
        }));
      }
    } catch {
      /* ignore */
    }

    const localItems = StudentPayoutAPI.loadLocalPayouts();
    const map = new Map<string, WithdrawalRequestItem>();
    for (const item of localItems) map.set(item.payout_id, item);
    for (const item of sbItems) map.set(item.payout_id, item);

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async markPaid(payoutId: string, utrRef: string): Promise<void> {
    const now = new Date().toISOString();
    // 1. Update Supabase
    try {
      await supabase
        .from('payouts')
        .update({
          status: 'PAID',
          utr_ref: utrRef,
          updated_at: now
        })
        .eq('payout_id', payoutId);
    } catch {
      /* ignore */
    }

    // 2. Update local storage
    const all = StudentPayoutAPI.loadLocalPayouts();
    const idx = all.findIndex((p) => p.payout_id === payoutId);
    if (idx !== -1) {
      all[idx].status = 'PAID';
      all[idx].utr_ref = utrRef;
      all[idx].updated_at = now;
      StudentPayoutAPI.saveLocalPayouts(all);
    }
  }
};
