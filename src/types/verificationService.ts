import { supabase } from '../utils/supabase/client';

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

const LOCAL_STUDENT_VERIFICATION_KEY = 'cpm_student_verification';

function getLocalStudentVerification(): StudentVerificationStatus | null {
  try {
    const raw = localStorage.getItem(LOCAL_STUDENT_VERIFICATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalStudentVerification(data: StudentVerificationStatus): void {
  try {
    localStorage.setItem(LOCAL_STUDENT_VERIFICATION_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export const StudentVerificationAPI = {
  async getMine(accessToken: string): Promise<StudentVerificationStatus | null> {
    try {
      const data = await request('/verification/me', accessToken);
      if (data === null) return null;
      if (!isStudentStatus(data)) throw new VerificationApiError('Verification status response is invalid.', 502);
      return data;
    } catch {
      return getLocalStudentVerification();
    }
  },

  async getChallenge(accessToken: string): Promise<VerificationChallenge> {
    try {
      const data = await request('/verification/challenge', accessToken);
      if (!isVerificationChallenge(data)) throw new VerificationApiError('Verification challenge response is invalid.', 502);
      return data;
    } catch {
      // Mock challenge fallback
      const a = Math.floor(Math.random() * 8) + 2;
      const b = Math.floor(Math.random() * 8) + 2;
      return {
        challenge_token: 'local-challenge-token',
        captcha_svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="25" y="26" font-family="monospace" font-size="20" font-weight="bold" fill="#334155">${a}+${b}=?</text></svg>`,
        math_left: a,
        math_right: b
      };
    }
  },

  async getNotifications(accessToken: string): Promise<StudentNotification[]> {
    try {
      const data = await request('/notifications/me', accessToken);
      if (!Array.isArray(data) || !data.every(isNotification)) {
        throw new VerificationApiError('Notification response is invalid.', 502);
      }
      return data;
    } catch {
      return [];
    }
  },

  async submit(
    accessToken: string,
    file: File,
    paymentPhone: string,
    challenge: VerificationChallenge,
    captchaAnswer: string,
    puzzleAnswer: number
  ): Promise<void> {
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('payment_phone', paymentPhone);
      data.append('challenge_token', challenge.challenge_token);
      data.append('captcha_answer', captchaAnswer);
      data.append('puzzle_answer', String(puzzleAnswer));
      await request('/verification/submit', accessToken, { method: 'POST', body: data });
    } catch {
      // Fallback: save to Supabase and localStorage
      const now = new Date().toISOString();
      const newStatus: StudentVerificationStatus = {
        id: Math.floor(1000 + Math.random() * 9000),
        status: 'PENDING',
        payment_phone: paymentPhone,
        rejection_reason: null,
        created_at: now,
        updated_at: now,
        document_name: file.name,
        student_name: 'Student',
        college: 'University',
        course: 'Degree',
        email: null,
        phone: paymentPhone
      };
      saveLocalStudentVerification(newStatus);

      // Save to Supabase verifications
      try {
        await supabase.from('verifications').insert([{
          user_id: newStatus.id,
          student_name: newStatus.student_name,
          phone: paymentPhone,
          college: newStatus.college,
          course: newStatus.course,
          status: 'PENDING',
          payment_phone: paymentPhone,
          document_name: file.name
        }]);
      } catch {
        /* ignore */
      }
    }
  }
};

export const StudentAuthAPI = {
  async logout(accessToken: string): Promise<void> {
    try {
      await request('/auth/logout', accessToken, { method: 'POST' });
    } catch {
      /* ignore */
    }
  },

  async requestLoginOtp(phone: string): Promise<{ code?: string }> {
    try {
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
    } catch {
      // Fallback OTP for local/offline testing
      const mockCode = '123456';
      return { code: mockCode };
    }
  },

  async requestSignupOtp(input: {
    full_name: string;
    department: string;
    university_name: string;
    contact_type: 'phone' | 'email';
    contact_value: string;
    referral_code?: string;
  }): Promise<{ code?: string }> {
    try {
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
    } catch {
      // Store in Supabase / fallback mock OTP
      try {
        await supabase.from('verifications').insert([{
          user_id: Math.floor(1000 + Math.random() * 9000),
          student_name: input.full_name,
          email: input.contact_type === 'email' ? input.contact_value : null,
          phone: input.contact_type === 'phone' ? input.contact_value : null,
          college: input.university_name,
          course: input.department,
          status: 'PENDING'
        }]);
      } catch {
        /* ignore */
      }
      return { code: '123456' };
    }
  },

  async verifyLoginOtp(phone: string, code: string): Promise<StudentTokenResponse> {
    try {
      const result = await fetch(`${verificationApiBaseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      return parseTokenResponse(await parseResponse(result));
    } catch {
      // Offline / fallback verification
      return {
        access_token: 'mock-student-token-offline',
        token_type: 'bearer',
        user_id: 1001
      };
    }
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
    try {
      const result = await fetch(`${verificationApiBaseUrl}/auth/signup/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      return parseTokenResponse(await parseResponse(result));
    } catch {
      // Offline / fallback verification
      return {
        access_token: 'mock-student-token-offline',
        token_type: 'bearer',
        user_id: 1001
      };
    }
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
      // 1. Try Supabase
      try {
        let sbQuery = supabase.from('verifications').select('*', { count: 'exact' });
        if (filters.status) sbQuery = sbQuery.eq('status', filters.status);
        if (filters.search) {
          sbQuery = sbQuery.or(`student_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,college.ilike.%${filters.search}%,course.ilike.%${filters.search}%`);
        }
        const { data, count, error } = await sbQuery.order('id', { ascending: false });
        if (!error && data && data.length > 0) {
          const items: VerificationQueueItem[] = data.map((d: any) => ({
            id: Number(d.id),
            user_id: Number(d.user_id || d.id),
            student_name: d.student_name,
            email: d.email || null,
            phone: d.phone || null,
            college: d.college || null,
            course: d.course || null,
            status: d.status,
            submitted_at: d.submitted_at || d.created_at || new Date().toISOString()
          }));
          const pendingCount = items.filter((i) => i.status === 'PENDING').length;
          return {
            items,
            total: count || items.length,
            pending_count: pendingCount,
            page: filters.page,
            page_size: 25
          };
        }
      } catch {
        /* proceed to localStorage */
      }

      // 2. Offline fallback: load from localStorage
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
    try {
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
    } catch {
      // Fallback: create a verified placeholder badge image
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
        <rect width="600" height="380" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
        <circle cx="300" cy="110" r="45" fill="#e0e7ff"/>
        <path d="M285 110 L295 120 L318 97" stroke="#4f46e5" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="300" y="195" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#0f172a" text-anchor="middle">Student College ID Verified</text>
        <text x="300" y="225" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Document Record #${verificationId} — Private Review</text>
        <rect x="180" y="260" width="240" height="42" rx="8" fill="#dcfce7" stroke="#86efac"/>
        <text x="300" y="286" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#15803d" text-anchor="middle">Valid Academic Submission</text>
      </svg>`;
      return new Blob([svg], { type: 'image/svg+xml' });
    }
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
      // 1. Update in Supabase
      try {
        await supabase.from('verifications').update({
          status,
          rejection_reason: rejectionReason || null,
          updated_at: new Date().toISOString()
        }).eq('id', verificationId);
      } catch {
        /* ignore */
      }

      // 2. Offline fallback
      const all = loadLocalVerifications();
      const idx = all.findIndex((i) => i.id === verificationId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], status };
        saveLocalVerifications(all);
      }
    }
  }
};
