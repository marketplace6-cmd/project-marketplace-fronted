import { VerificationApiError } from './verificationService';

export interface CommercePage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminOrderRecord {
  id: number;
  user_id: number;
  project_id: number;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  project_title: string;
  payment_status: string | null;
  student_name: string;
}

export interface MeetingRecordDTO {
  id: number;
  student_id: number;
  student_name?: string | null;
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
  created_at: string;
  updated_at?: string;
}

export interface StudentOrderRecord {
  id: number;
  user_id: number;
  project_id: number;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  project_title: string;
  payment_status: string | null;
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

async function parseResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
        message = body.detail;
      }
    } catch {
      // Retain the HTTP status when the server does not return JSON.
    }
    throw new VerificationApiError(message, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new VerificationApiError('Commerce service returned an invalid response.', 502);
  }
}

const configuredBaseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/+$/, '');
export const commerceApiBaseUrl = configuredBaseUrl.endsWith('/api/v1')
  ? configuredBaseUrl
  : configuredBaseUrl.endsWith('/api')
    ? `${configuredBaseUrl}/v1`
    : `${configuredBaseUrl}/api/v1`;

async function authorized<T>(path: string, accessToken: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  return await parseResponse(await fetch(`${commerceApiBaseUrl}${path}`, {
    ...options,
    headers,
    cache: 'no-store'
  })) as T;
}

function isPage<T>(
  value: unknown,
  isItem: (item: unknown) => item is T
): value is CommercePage<T> {
  if (typeof value !== 'object' || value === null || !('items' in value) || !('total' in value) || !('page' in value) || !('page_size' in value)) {
    return false;
  }
  const page = value as Record<string, unknown>;
  return Array.isArray(page.items)
    && page.items.every(isItem)
    && typeof page.total === 'number'
    && typeof page.page === 'number'
    && typeof page.page_size === 'number';
}

function optionalString(value: unknown): value is string | null {
  return value === undefined || value === null || typeof value === 'string';
}

function isAdminOrder(value: unknown): value is AdminOrderRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'number'
    && typeof item.user_id === 'number'
    && typeof item.project_id === 'number'
    && typeof item.status === 'string'
    && typeof item.amount === 'number'
    && typeof item.currency === 'string'
    && typeof item.created_at === 'string'
    && typeof item.updated_at === 'string'
    && typeof item.project_title === 'string'
    && optionalString(item.payment_status)
    && typeof item.student_name === 'string';
}

function isMeeting(value: unknown): value is MeetingRecordDTO {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'number'
    && typeof item.student_id === 'number'
    && optionalString(item.student_name)
    && typeof item.project_id === 'number'
    && typeof item.project_title === 'string'
    && typeof item.guide_id === 'number'
    && typeof item.start_time === 'string'
    && typeof item.end_time === 'string'
    && typeof item.timezone === 'string'
    && typeof item.status === 'string'
    && optionalString(item.google_meet_url)
    && optionalString(item.payment_status)
    && optionalString(item.reviewed_at)
    && typeof item.created_at === 'string';
}

function isStudentOrder(value: unknown): value is StudentOrderRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'number'
    && typeof item.user_id === 'number'
    && typeof item.project_id === 'number'
    && typeof item.status === 'string'
    && typeof item.amount === 'number'
    && typeof item.currency === 'string'
    && typeof item.created_at === 'string'
    && typeof item.updated_at === 'string'
    && typeof item.project_title === 'string'
    && optionalString(item.payment_status);
}

function isSelection(value: unknown): value is SelectionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'number'
    && typeof item.project_id === 'number'
    && typeof item.selected_at === 'string'
    && typeof item.is_active === 'boolean';
}

function isCommerceNotification(value: unknown): value is CommerceNotification {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'number'
    && typeof item.notification_type === 'string'
    && typeof item.message === 'string'
    && typeof item.is_read === 'boolean'
    && typeof item.created_at === 'string';
}

export const AdminCommerceAPI = {
  async listOrders(
    token: string,
    filters: { search: string; paymentStatus: string; orderStatus: string; page: number }
  ): Promise<CommercePage<AdminOrderRecord>> {
    try {
      const query = new URLSearchParams({ page: String(filters.page), page_size: '25' });
      if (filters.search) query.set('search', filters.search);
      if (filters.paymentStatus) query.set('payment_status', filters.paymentStatus);
      if (filters.orderStatus) query.set('order_status', filters.orderStatus);
      const result: unknown = await authorized(`/admin/management/orders?${query}`, token);
      if (!isPage(result, isAdminOrder)) throw new VerificationApiError('Admin order response is invalid.', 502);
      return result;
    } catch {
      return { items: [], total: 0, page: filters.page, page_size: 25 };
    }
  },

  async listMeetings(
    token: string,
    filters: { search: string; status: string; page: number }
  ): Promise<CommercePage<MeetingRecordDTO>> {
    try {
      const query = new URLSearchParams({ page: String(filters.page), page_size: '25' });
      if (filters.search) query.set('search', filters.search);
      if (filters.status) query.set('meeting_status', filters.status);
      const result: unknown = await authorized(`/admin/management/meetings?${query}`, token);
      if (!isPage(result, isMeeting)) throw new VerificationApiError('Admin meeting response is invalid.', 502);
      return result;
    } catch {
      return { items: [], total: 0, page: filters.page, page_size: 25 };
    }
  },

  async approveMeeting(token: string, meetingId: number, url: string): Promise<void> {
    await authorized(`/admin/meetings/${meetingId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'SCHEDULED', google_meet_url: url })
    });
  }
};

export const StudentCommerceAPI = {
  async listNotifications(token: string): Promise<CommerceNotification[]> {
    const result: unknown = await authorized('/notifications/me', token);
    if (!Array.isArray(result) || !result.every(isCommerceNotification)) {
      throw new VerificationApiError('Student notification response is invalid.', 502);
    }
    return result;
  },

  async listOrders(token: string): Promise<StudentOrderRecord[]> {
    const result: unknown = await authorized('/orders', token);
    if (!Array.isArray(result) || !result.every(isStudentOrder)) {
      throw new VerificationApiError('Student order response is invalid.', 502);
    }
    return result;
  },

  async listMeetings(token: string): Promise<MeetingRecordDTO[]> {
    const result: unknown = await authorized('/meetings', token);
    if (!Array.isArray(result) || !result.every(isMeeting)) {
      throw new VerificationApiError('Student meeting response is invalid.', 502);
    }
    return result;
  },

  async listSelections(token: string): Promise<SelectionRecord[]> {
    const result: unknown = await authorized('/selections', token);
    if (!Array.isArray(result) || !result.every(isSelection)) {
      throw new VerificationApiError('Student selection response is invalid.', 502);
    }
    return result.filter((item) => item.is_active);
  },

  async addSelection(token: string, projectId: number): Promise<void> {
    await authorized(`/selections/${projectId}`, token, { method: 'POST' });
  },

  async removeSelection(token: string, projectId: number): Promise<void> {
    await authorized(`/selections/${projectId}`, token, { method: 'DELETE' });
  },

  async createOrder(token: string, projectId: number): Promise<StudentOrderRecord> {
    const result: unknown = await authorized('/orders', token, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId })
    });
    if (!isStudentOrder(result)) throw new VerificationApiError('Order response is invalid.', 502);
    return result;
  },

  async createMeeting(
    token: string,
    meeting: { project_id: number; guide_id: number; start_time: string; end_time: string; timezone: string }
  ): Promise<MeetingRecordDTO> {
    const result: unknown = await authorized('/meetings', token, {
      method: 'POST',
      body: JSON.stringify(meeting)
    });
    if (!isMeeting(result)) throw new VerificationApiError('Meeting response is invalid.', 502);
    return result;
  },

  async getAvailableGuide(): Promise<number | null> {
    const result: unknown = await parseResponse(await fetch(`${commerceApiBaseUrl}/meetings/available-slots`));
    if (typeof result !== 'object' || result === null || !('slots' in result) || !Array.isArray(result.slots)) {
      throw new VerificationApiError('Meeting availability response is invalid.', 502);
    }
    if (result.slots.length === 0) return null;
    const first = result.slots[0];
    if (typeof first !== 'object' || first === null || !('guide_id' in first) || typeof first.guide_id !== 'number') {
      throw new VerificationApiError('Meeting availability response is invalid.', 502);
    }
    return first.guide_id;
  }
};
