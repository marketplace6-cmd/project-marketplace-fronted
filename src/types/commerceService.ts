import { VerificationApiError } from './verificationService';
import { supabase } from '../utils/supabase/client';
import { creditReferralReward } from './referralService';

export interface CommercePage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminOrderRecord {
  id: number;
  user_id: number | string;
  student_id?: string | null;
  student_name: string;
  student_email?: string | null;
  project_id: number;
  project_title: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  payment_status: string | null;
  utr_number?: string | null;
  payment_screenshot_url?: string | null;
  deliverable_url?: string | null;
  invoice_number?: string | null;
}

export interface MeetingRecordDTO {
  id: number;
  student_id: number | string;
  student_name?: string | null;
  student_email?: string | null;
  project_id: number;
  project_title: string;
  guide_id: number;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  google_meet_url: string | null;
  payment_status?: string | null;
  reviewed_at?: string | null;
  requested_date?: string | null;
  time_slot?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StudentOrderRecord {
  id: number;
  user_id: number | string;
  student_id?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  project_id: number;
  project_title: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  payment_status: string | null;
  utr_number?: string | null;
  payment_screenshot_url?: string | null;
  deliverable_url?: string | null;
  invoice_number?: string | null;
}

export interface SelectionRecord {
  id: number;
  project_id: number;
  selected_at: string;
  is_active: boolean;
}

export interface CommerceNotification {
  id: number;
  notification_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const configuredBaseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/+$/, '');
export const commerceApiBaseUrl = configuredBaseUrl.endsWith('/api/v1')
  ? configuredBaseUrl
  : configuredBaseUrl.endsWith('/api')
    ? `${configuredBaseUrl}/v1`
    : `${configuredBaseUrl}/api/v1`;

export const AdminCommerceAPI = {
  /**
   * List orders for Admin with live Supabase query
   */
  async listOrders(
    token: string,
    filters: { search: string; paymentStatus: string; orderStatus: string; page: number }
  ): Promise<CommercePage<AdminOrderRecord>> {
    try {
      let sbQuery = supabase.from('orders').select('*', { count: 'exact' });
      if (filters.paymentStatus) sbQuery = sbQuery.eq('payment_status', filters.paymentStatus);
      if (filters.orderStatus) sbQuery = sbQuery.eq('status', filters.orderStatus);
      if (filters.search) {
        sbQuery = sbQuery.or(
          `student_name.ilike.%${filters.search}%,project_title.ilike.%${filters.search}%,utr_number.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%`
        );
      }
      const from = (filters.page - 1) * 25;
      const to = from + 24;
      const { data, count, error } = await sbQuery.order('id', { ascending: false }).range(from, to);

      if (!error && Array.isArray(data)) {
        const items: AdminOrderRecord[] = data.map((d: any) => ({
          id: Number(d.id),
          user_id: d.user_id,
          student_id: d.student_id || String(d.user_id),
          student_name: d.student_name || 'Student',
          student_email: d.student_email || null,
          project_id: Number(d.project_id),
          project_title: d.project_title,
          status: d.status || 'PENDING',
          amount: Number(d.amount) || 0,
          currency: d.currency || 'INR',
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || new Date().toISOString(),
          payment_status: d.payment_status || 'AWAITING_VERIFICATION',
          utr_number: d.utr_number || null,
          payment_screenshot_url: d.payment_screenshot_url || null,
          deliverable_url: d.deliverable_url || null,
          invoice_number: d.invoice_number || `INV-2026-${String(d.id).padStart(4, '0')}`
        }));
        return { items, total: count ?? items.length, page: filters.page, page_size: 25 };
      }
    } catch (err) {
      console.warn('Admin listOrders Supabase query notice:', err);
    }
    return { items: [], total: 0, page: filters.page, page_size: 25 };
  },

  /**
   * Verify Student UTR Payment, Attach Deliverable ZIP, and Credit 20% Referral Commission
   */
  async verifyOrder(
    token: string,
    orderId: number,
    action: 'APPROVE' | 'REJECT',
    deliverableUrl?: string
  ): Promise<{ success: boolean; referralRewarded: boolean; rewardAmount: number }> {
    const now = new Date().toISOString();
    let referralRewarded = false;
    let rewardAmount = 0;

    if (action === 'APPROVE') {
      const { data: updatedRows, error: updateErr } = await supabase
        .from('orders')
        .update({
          payment_status: 'PAID',
          status: 'COMPLETED',
          deliverable_url: deliverableUrl ? deliverableUrl.trim() : null,
          updated_at: now
        })
        .eq('id', orderId)
        .select();

      if (updateErr) {
        throw new VerificationApiError(`Failed to approve order: ${updateErr.message}`, 500);
      }

      // Check if student was referred and credit 20% commission
      const targetOrder = updatedRows?.[0];
      if (targetOrder) {
        const studentIdentifier = targetOrder.student_id || String(targetOrder.user_id);
        const studentEmail = targetOrder.student_email;
        const paidAmount = Number(targetOrder.amount) || 0;

        const creditResult = await creditReferralReward(
          studentIdentifier,
          studentEmail,
          orderId,
          paidAmount
        );
        referralRewarded = creditResult.credited;
        rewardAmount = creditResult.rewardAmount;
      }

      return { success: true, referralRewarded, rewardAmount };
    } else {
      const { error: rejectErr } = await supabase
        .from('orders')
        .update({
          payment_status: 'REJECTED',
          status: 'CANCELLED',
          updated_at: now
        })
        .eq('id', orderId);

      if (rejectErr) {
        throw new VerificationApiError(`Failed to reject order: ${rejectErr.message}`, 500);
      }

      return { success: true, referralRewarded: false, rewardAmount: 0 };
    }
  },

  /**
   * List meeting requests for Admin
   */
  async listMeetings(
    token: string,
    filters: { search: string; status: string; page: number }
  ): Promise<CommercePage<MeetingRecordDTO>> {
    try {
      let sbQuery = supabase.from('meetings').select('*', { count: 'exact' });
      if (filters.status) sbQuery = sbQuery.eq('status', filters.status);
      if (filters.search) {
        sbQuery = sbQuery.or(
          `student_name.ilike.%${filters.search}%,project_title.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%`
        );
      }
      const from = (filters.page - 1) * 25;
      const to = from + 24;
      const { data, count, error } = await sbQuery.order('id', { ascending: false }).range(from, to);

      if (!error && Array.isArray(data)) {
        const items: MeetingRecordDTO[] = data.map((d: any) => ({
          id: Number(d.id),
          student_id: d.student_id,
          student_name: d.student_name || null,
          student_email: d.student_email || null,
          project_id: Number(d.project_id),
          project_title: d.project_title,
          guide_id: Number(d.guide_id || 1),
          start_time: d.start_time,
          end_time: d.end_time,
          timezone: d.timezone || 'Asia/Kolkata',
          status: d.status,
          google_meet_url: d.google_meet_url || null,
          payment_status: d.payment_status || null,
          reviewed_at: d.reviewed_at || null,
          requested_date: d.requested_date || null,
          time_slot: d.time_slot || null,
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || undefined
        }));
        return { items, total: count ?? items.length, page: filters.page, page_size: 25 };
      }
    } catch (err) {
      console.warn('Admin listMeetings Supabase notice:', err);
    }
    return { items: [], total: 0, page: filters.page, page_size: 25 };
  },

  /**
   * Approve meeting, attach Google Meet link and optionally update scheduled date/time
   */
  async approveMeeting(
    token: string,
    meetingId: number,
    url: string,
    scheduleUpdates?: { start_time?: string; end_time?: string; requested_date?: string; time_slot?: string }
  ): Promise<void> {
    const updatePayload: Record<string, any> = {
      status: 'SCHEDULED',
      google_meet_url: url,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (scheduleUpdates?.start_time) updatePayload.start_time = scheduleUpdates.start_time;
    if (scheduleUpdates?.end_time) updatePayload.end_time = scheduleUpdates.end_time;
    if (scheduleUpdates?.requested_date) updatePayload.requested_date = scheduleUpdates.requested_date;
    if (scheduleUpdates?.time_slot) updatePayload.time_slot = scheduleUpdates.time_slot;

    const { error: sbErr } = await supabase
      .from('meetings')
      .update(updatePayload)
      .eq('id', meetingId);

    if (sbErr) {
      throw new VerificationApiError(`Failed to approve meeting in database: ${sbErr.message}`, 500);
    }
  }
};

export const StudentCommerceAPI = {
  /**
   * List Student's orders directly from Supabase
   */
  async listOrders(token?: string, studentIdentifier?: string): Promise<StudentOrderRecord[]> {
    try {
      let sbQuery = supabase.from('orders').select('*');
      if (studentIdentifier) {
        const clean = studentIdentifier.trim();
        sbQuery = sbQuery.or(`student_id.eq.${clean},student_email.ilike.${clean},user_id.eq.${clean}`);
      }
      const { data, error } = await sbQuery.order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d: any) => ({
          id: Number(d.id),
          user_id: d.user_id,
          student_id: d.student_id,
          student_name: d.student_name,
          student_email: d.student_email,
          project_id: Number(d.project_id),
          status: d.status || 'PENDING',
          amount: Number(d.amount) || 0,
          currency: d.currency || 'INR',
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || new Date().toISOString(),
          project_title: d.project_title,
          payment_status: d.payment_status || 'AWAITING_VERIFICATION',
          utr_number: d.utr_number || null,
          payment_screenshot_url: d.payment_screenshot_url || null,
          deliverable_url: d.deliverable_url || null,
          invoice_number: d.invoice_number || `INV-2026-${String(d.id).padStart(4, '0')}`
        }));
      }
    } catch (err) {
      console.warn('Student listOrders Supabase notice:', err);
    }
    return [];
  },

  /**
   * Submit new Order with 12-digit UTR and payment screenshot directly to Supabase
   */
  async submitOrderPayment(orderPayload: {
    user_id: string | number;
    student_id: string;
    student_name: string;
    student_email: string;
    project_id: number;
    project_title: string;
    amount: number;
    utr_number: string;
    payment_screenshot_url: string;
    invoice_number: string;
  }): Promise<StudentOrderRecord> {
    const record = {
      user_id: orderPayload.user_id,
      student_id: orderPayload.student_id,
      student_name: orderPayload.student_name,
      student_email: orderPayload.student_email,
      project_id: orderPayload.project_id,
      project_title: orderPayload.project_title,
      amount: orderPayload.amount,
      currency: 'INR',
      payment_status: 'AWAITING_VERIFICATION',
      status: 'PENDING',
      utr_number: orderPayload.utr_number,
      payment_screenshot_url: orderPayload.payment_screenshot_url,
      deliverable_url: null,
      invoice_number: orderPayload.invoice_number,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([record])
      .select()
      .single();

    if (error) {
      throw new VerificationApiError(`Failed to submit order to database: ${error.message}`, 500);
    }

    return {
      id: Number(data.id),
      user_id: data.user_id,
      student_id: data.student_id,
      student_name: data.student_name,
      student_email: data.student_email,
      project_id: Number(data.project_id),
      status: data.status,
      amount: Number(data.amount),
      currency: data.currency,
      created_at: data.created_at,
      updated_at: data.updated_at,
      project_title: data.project_title,
      payment_status: data.payment_status,
      utr_number: data.utr_number,
      payment_screenshot_url: data.payment_screenshot_url,
      deliverable_url: data.deliverable_url,
      invoice_number: data.invoice_number
    };
  },

  /**
   * List Student's meetings directly from Supabase
   */
  async listMeetings(token?: string, studentIdentifier?: string): Promise<MeetingRecordDTO[]> {
    try {
      let sbQuery = supabase.from('meetings').select('*');
      if (studentIdentifier) {
        const clean = studentIdentifier.trim();
        sbQuery = sbQuery.or(`student_id.eq.${clean},student_email.ilike.${clean}`);
      }
      const { data, error } = await sbQuery.order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d: any) => ({
          id: Number(d.id),
          student_id: d.student_id,
          student_name: d.student_name || null,
          student_email: d.student_email || null,
          project_id: Number(d.project_id),
          project_title: d.project_title,
          guide_id: Number(d.guide_id || 1),
          start_time: d.start_time,
          end_time: d.end_time,
          timezone: d.timezone || 'Asia/Kolkata',
          status: d.status,
          google_meet_url: d.google_meet_url || null,
          payment_status: d.payment_status || null,
          reviewed_at: d.reviewed_at || null,
          requested_date: d.requested_date || null,
          time_slot: d.time_slot || null,
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || undefined
        }));
      }
    } catch (err) {
      console.warn('Student listMeetings Supabase notice:', err);
    }
    return [];
  },

  /**
   * Request a 5-minute meeting directly in Supabase (Max 3 active meetings rule)
   */
  async createMeeting(meetingPayload: {
    student_id: string | number;
    student_name: string;
    student_email: string;
    project_id: number;
    project_title: string;
    start_time: string;
    end_time: string;
    timezone?: string;
    requested_date?: string;
    time_slot?: string;
  }): Promise<MeetingRecordDTO> {
    // 1. Enforce max 3 active meetings
    const cleanId = String(meetingPayload.student_id);
    const cleanEmail = meetingPayload.student_email || '';
    const { data: activeMeetings } = await supabase
      .from('meetings')
      .select('id, status')
      .or(`student_id.eq.${cleanId}${cleanEmail ? `,student_email.ilike.${cleanEmail}` : ''}`)
      .not('status', 'in', '("CANCELLED","REJECTED")');

    if (activeMeetings && activeMeetings.length >= 3) {
      throw new VerificationApiError('Maximum limit reached: You can have at most 3 guidance meetings.', 400);
    }

    const record = {
      student_id: meetingPayload.student_id,
      student_name: meetingPayload.student_name,
      student_email: meetingPayload.student_email,
      project_id: meetingPayload.project_id,
      project_title: meetingPayload.project_title,
      guide_id: 1,
      start_time: meetingPayload.start_time,
      end_time: meetingPayload.end_time,
      timezone: meetingPayload.timezone || 'Asia/Kolkata',
      requested_date: meetingPayload.requested_date || null,
      time_slot: meetingPayload.time_slot || null,
      status: 'PENDING',
      google_meet_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('meetings')
      .insert([record])
      .select()
      .single();

    if (error) {
      throw new VerificationApiError(`Failed to request meeting in database: ${error.message}`, 500);
    }

    return {
      id: Number(data.id),
      student_id: data.student_id,
      student_name: data.student_name,
      student_email: data.student_email,
      project_id: Number(data.project_id),
      project_title: data.project_title,
      guide_id: Number(data.guide_id),
      start_time: data.start_time,
      end_time: data.end_time,
      timezone: data.timezone,
      status: data.status,
      google_meet_url: data.google_meet_url,
      payment_status: data.payment_status,
      reviewed_at: data.reviewed_at,
      requested_date: data.requested_date,
      time_slot: data.time_slot,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  },

  /**
   * Project Selections for Guidance
   */
  async listSelections(token?: string, studentId?: string): Promise<SelectionRecord[]> {
    try {
      const raw = localStorage.getItem(`cpm_selections_${studentId || 'default'}`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
  },

  async addSelection(token: string, projectId: number, studentId?: string): Promise<void> {
    try {
      const key = `cpm_selections_${studentId || 'default'}`;
      const existing = await this.listSelections(token, studentId);
      if (!existing.some((s) => s.project_id === projectId)) {
        existing.push({
          id: Date.now(),
          project_id: projectId,
          selected_at: new Date().toISOString(),
          is_active: true
        });
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch { /* ignore */ }
  },

  async removeSelection(token: string, projectId: number, studentId?: string): Promise<void> {
    try {
      const key = `cpm_selections_${studentId || 'default'}`;
      const existing = await this.listSelections(token, studentId);
      const remaining = existing.filter((s) => s.project_id !== projectId);
      localStorage.setItem(key, JSON.stringify(remaining));
    } catch { /* ignore */ }
  },

  async listNotifications(token: string): Promise<CommerceNotification[]> {
    return [];
  },

  async getAvailableGuide(): Promise<number | null> {
    return 1;
  }
};
