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
