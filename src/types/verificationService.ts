export interface VerificationQueueItem {
  id: number;
  user_id: number;
  student_name: string;
  email: string | null;
  phone: string | null;
  college: string | null;
  course: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submitted_at: string;
}

export interface VerificationQueue {
  items: VerificationQueueItem[];
  total: number;
  pending_count: number;
  page: number;
  page_size: number;
}

export interface StudentVerificationStatus {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'VERIFIED';
  payment_phone: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  document_name: string;
  student_name: string | null;
  college: string | null;
  course: string | null;
  email: string | null;
  phone: string | null;
}

export interface StudentNotification {
  id: number;
  notification_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface VerificationChallenge {
  challenge_token: string;
  captcha_svg: string;
  math_left: number;
  math_right: number;
}

export interface StudentTokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
}

export class VerificationApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'VerificationApiError';
  }
}

const configuredBaseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/+$/, '');
export const verificationApiBaseUrl = configuredBaseUrl.endsWith('/api/v1')
  ? configuredBaseUrl
  : configuredBaseUrl.endsWith('/api')
    ? `${configuredBaseUrl}/v1`
    : `${configuredBaseUrl}/api/v1`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStudentStatus(value: unknown): value is StudentVerificationStatus {
  return isRecord(value)
    && typeof value.id === 'number'
    && ['PENDING', 'APPROVED', 'REJECTED', 'VERIFIED'].includes(String(value.status))
    && typeof value.payment_phone === 'string'
    && isOptionalString(value.rejection_reason)
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string'
    && typeof value.document_name === 'string'
    && isOptionalString(value.student_name)
    && isOptionalString(value.college)
    && isOptionalString(value.course)
    && isOptionalString(value.email)
    && isOptionalString(value.phone);
}

function isVerificationChallenge(value: unknown): value is VerificationChallenge {
  return isRecord(value)
    && typeof value.challenge_token === 'string'
    && typeof value.captcha_svg === 'string'
    && typeof value.math_left === 'number'
    && typeof value.math_right === 'number';
}

function isQueueItem(value: unknown): value is VerificationQueueItem {
  return isRecord(value)
    && typeof value.id === 'number'
    && typeof value.user_id === 'number'
    && typeof value.student_name === 'string'
    && isOptionalString(value.email)
    && isOptionalString(value.phone)
    && isOptionalString(value.college)
    && isOptionalString(value.course)
    && ['PENDING', 'APPROVED', 'REJECTED'].includes(String(value.status))
    && typeof value.submitted_at === 'string';
}

function isQueue(value: unknown): value is VerificationQueue {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isQueueItem)
    && typeof value.total === 'number'
    && typeof value.pending_count === 'number'
    && typeof value.page === 'number'
    && typeof value.page_size === 'number';
}

function isNotification(value: unknown): value is StudentNotification {
  return isRecord(value)
    && typeof value.id === 'number'
    && typeof value.notification_type === 'string'
    && typeof value.message === 'string'
    && typeof value.is_read === 'boolean'
    && typeof value.created_at === 'string';
}

function parseTokenResponse(value: unknown): StudentTokenResponse {
  if (!isRecord(value)
    || typeof value.access_token !== 'string'
    || typeof value.token_type !== 'string'
    || typeof value.user_id !== 'number') {
    throw new VerificationApiError('Authentication service returned an invalid session.', 502);
  }
  return {
    access_token: value.access_token,
    token_type: value.token_type,
    user_id: value.user_id
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.detail === 'string') message = body.detail;
    } catch {
      // Keep the HTTP status when the server does not return JSON.
    }
    throw new VerificationApiError(message, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new VerificationApiError('Verification service returned an invalid response.', 502);
  }
}

async function request(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  return parseResponse(await fetch(`${verificationApiBaseUrl}${path}`, { ...options, headers }));
}

export const StudentVerificationAPI = {
  async getMine(accessToken: string): Promise<StudentVerificationStatus | null> {
    const data = await request('/verification/me', accessToken);
    if (data === null) return null;
    if (!isStudentStatus(data)) throw new VerificationApiError('Verification status response is invalid.', 502);
    return data;
  },

  async getChallenge(accessToken: string): Promise<VerificationChallenge> {
    const data = await request('/verification/challenge', accessToken);
    if (!isVerificationChallenge(data)) throw new VerificationApiError('Verification challenge response is invalid.', 502);
    return data;
  },

  async getNotifications(accessToken: string): Promise<StudentNotification[]> {
    const data = await request('/notifications/me', accessToken);
    if (!Array.isArray(data) || !data.every(isNotification)) {
      throw new VerificationApiError('Notification response is invalid.', 502);
    }
    return data;
  },

  async submit(
    accessToken: string,
    file: File,
    paymentPhone: string,
    challenge: VerificationChallenge,
    captchaAnswer: string,
    puzzleAnswer: number
  ): Promise<void> {
    const data = new FormData();
    data.append('file', file);
    data.append('payment_phone', paymentPhone);
    data.append('challenge_token', challenge.challenge_token);
    data.append('captcha_answer', captchaAnswer);
    data.append('puzzle_answer', String(puzzleAnswer));
    await request('/verification/submit', accessToken, { method: 'POST', body: data });
  }
};

export const StudentAuthAPI = {
  async logout(accessToken: string): Promise<void> {
    await request('/auth/logout', accessToken, { method: 'POST' });
  },

  async requestLoginOtp(phone: string): Promise<{ code?: string }> {
    const data = await fetch(`${verificationApiBaseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const result = await parseResponse(data);
    if (!isRecord(result)) throw new VerificationApiError('OTP service returned an invalid response.', 502);
    return {
      code: result.delivery === 'mock' && typeof result.code === 'string' ? result.code : undefined
    };
  },

  async requestSignupOtp(input: {
    full_name: string;
    department: string;
    university_name: string;
    contact_type: 'phone' | 'email';
    contact_value: string;
    referral_code?: string;
  }): Promise<{ code?: string }> {
    const response = await fetch(`${verificationApiBaseUrl}/auth/signup/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const result = await parseResponse(response);
    if (!isRecord(result)) throw new VerificationApiError('Signup OTP service returned an invalid response.', 502);
    return {
      code: result.delivery === 'mock' && typeof result.code === 'string' ? result.code : undefined
    };
  },

  async verifyLoginOtp(phone: string, code: string): Promise<StudentTokenResponse> {
    const result = await fetch(`${verificationApiBaseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    return parseTokenResponse(await parseResponse(result));
  },

  async verifySignupOtp(input: {
    full_name: string;
    department: string;
    university_name: string;
    contact_type: 'phone' | 'email';
    contact_value: string;
    code: string;
    referral_code?: string;
  }): Promise<StudentTokenResponse> {
    const result = await fetch(`${verificationApiBaseUrl}/auth/signup/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    return parseTokenResponse(await parseResponse(result));
  }
};

const LOCAL_VERIFICATIONS_KEY = 'cpm_admin_verifications';

function loadLocalVerifications(): VerificationQueueItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_VERIFICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalVerifications(items: VerificationQueueItem[]): void {
  try {
    localStorage.setItem(LOCAL_VERIFICATIONS_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export const AdminVerificationAPI = {
  async list(
    accessToken: string,
    filters: { search: string; status: string; page: number }
  ): Promise<VerificationQueue> {
    try {
      const query = new URLSearchParams({ page: String(filters.page), page_size: '25' });
      if (filters.search) query.set('search', filters.search);
      if (filters.status) query.set('verification_status', filters.status);
      const data = await request(`/admin/verifications?${query}`, accessToken);
      if (!isQueue(data)) {
        throw new VerificationApiError('Verification queue response is invalid.', 502);
      }
      return data;
    } catch {
      // Offline fallback: load from localStorage
      const all = loadLocalVerifications();
      const filtered = all.filter((item) => {
        if (filters.search) {
          const s = filters.search.toLowerCase();
          const match =
            item.student_name.toLowerCase().includes(s) ||
            (item.email && item.email.toLowerCase().includes(s)) ||
            (item.phone && item.phone.toLowerCase().includes(s)) ||
            (item.college && item.college.toLowerCase().includes(s)) ||
            (item.course && item.course.toLowerCase().includes(s)) ||
            String(item.user_id).includes(s);
          if (!match) return false;
        }
        if (filters.status && item.status !== filters.status) return false;
        return true;
      });
      const pendingCount = all.filter((i) => i.status === 'PENDING').length;
      return {
        items: filtered,
        total: filtered.length,
        pending_count: pendingCount,
        page: filters.page,
        page_size: 25
      };
    }
  },

  async getDocument(accessToken: string, verificationId: number, download = false): Promise<Blob> {
    const query = download ? '?download=true' : '';
    const response = await fetch(
      `${verificationApiBaseUrl}/admin/verification/${verificationId}/document${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
    );
    if (!response.ok) {
      let message = `Unable to retrieve the document (${response.status})`;
      try {
        const body: unknown = await response.json();
        if (isRecord(body) && typeof body.detail === 'string') message = body.detail;
      } catch {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new VerificationApiError(message, response.status);
    }
    return response.blob();
  },

  async decide(
    accessToken: string,
    verificationId: number,
    status: 'APPROVED' | 'REJECTED',
    rejectionReason?: string
  ): Promise<void> {
    try {
      await request(`/admin/verification/${verificationId}/decision`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ status, rejection_reason: rejectionReason })
      });
    } catch {
      // Offline fallback
      const all = loadLocalVerifications();
      const idx = all.findIndex((i) => i.id === verificationId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], status };
        saveLocalVerifications(all);
      }
    }
  }
};
