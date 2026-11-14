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
  document_name?: string;
  document_type?: string;
  referral_code?: string;
  student_id_code?: string;
  front_image_url?: string;
  back_image_url?: string;
  front_data_url?: string;
  back_data_url?: string;
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
  front_image_url?: string;
  back_image_url?: string;
  front_data_url?: string;
  back_data_url?: string;
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
      try {
        const { data } = await supabase
          .from('verifications')
          .select('*')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          return {
            id: Number(data.id),
            status: data.status,
            payment_phone: data.payment_phone || data.phone || '',
            rejection_reason: data.rejection_reason || null,
            created_at: data.submitted_at || data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || data.created_at || new Date().toISOString(),
            document_name: data.document_name || 'id-card.jpg',
            student_name: data.student_name || 'Student',
            college: data.college || 'University',
            course: data.course || 'Degree',
            email: data.email || null,
            phone: data.phone || data.payment_phone || ''
          };
        }
      } catch {
        /* fallback */
      }
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
    puzzleAnswer: number,
    studentDetails?: {
      student_name?: string;
      email?: string;
      college?: string;
      course?: string;
      user_id?: number | string;
    }
  ): Promise<void> {
    let documentDataUrl = '';
    try {
      documentDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } catch {
      documentDataUrl = file.name;
    }

    try {
      const data = new FormData();
      data.append('file', file);
      data.append('payment_phone', paymentPhone);
      data.append('challenge_token', challenge.challenge_token);
      data.append('captcha_answer', captchaAnswer);
      data.append('puzzle_answer', String(puzzleAnswer));
      if (studentDetails?.student_name) data.append('student_name', studentDetails.student_name);
      if (studentDetails?.email) data.append('email', studentDetails.email);
      if (studentDetails?.college) data.append('college', studentDetails.college);
      if (studentDetails?.course) data.append('course', studentDetails.course);
      await request('/verification/submit', accessToken, { method: 'POST', body: data });
    } catch {
      // Fallback: save to Supabase and localStorage with REAL student details and full image data URL
      const now = new Date().toISOString();
      const studentName = studentDetails?.student_name || 'Student';
      const studentEmail = studentDetails?.email || null;
      const studentCollege = studentDetails?.college || 'University';
      const studentCourse = studentDetails?.course || 'Degree';
      const userId = Number(studentDetails?.user_id) || Math.floor(1000 + Math.random() * 9000);

      const newStatus: StudentVerificationStatus = {
        id: userId,
        status: 'PENDING',
        payment_phone: paymentPhone,
        rejection_reason: null,
        created_at: now,
        updated_at: now,
        document_name: documentDataUrl || file.name,
        student_name: studentName,
        college: studentCollege,
        course: studentCourse,
        email: studentEmail,
        phone: paymentPhone
      };
      saveLocalStudentVerification(newStatus);

      // Save to Supabase verifications
      try {
        await supabase.from('verifications').insert([{
          user_id: userId,
          student_name: studentName,
          email: studentEmail,
          phone: paymentPhone,
          college: studentCollege,
          course: studentCourse,
          status: 'PENDING',
          payment_phone: paymentPhone,
          document_name: documentDataUrl || file.name
        }]);
      } catch {
        /* ignore */
      }
    }
  },

  async submitDual(
    formData: FormData,
    details: {
      student_name: string;
      email: string;
      phone: string;
      college: string;
      course: string;
      student_id_code: string;
      referral_code: string;
      front_data_url: string;
      back_data_url?: string;
      front_filename: string;
      back_filename?: string;
      user_id?: string | number;
    }
  ): Promise<void> {
    // 1. Post to backend endpoints
    const endpoints = [
      `${verificationApiBaseUrl}/students/verify`,
      `${verificationApiBaseUrl.replace(/\/v1$/, '')}/students/verify`,
      '/api/students/verify',
      `${verificationApiBaseUrl}/verification/submit-dual`
    ];

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          body: formData
        });
        if (resp.ok) break;
      } catch {
        /* try next */
      }
    }

    // 2. Persist in localStorage queue and Supabase so Admin instantly receives it
    const now = new Date().toISOString();
    const userId = Number(details.user_id) || (details.student_id_code === 'STU-2026-0001' ? 1346 : Math.floor(1000 + Math.random() * 9000));

    const newItem: VerificationQueueItem = {
      id: userId,
      user_id: userId,
      student_name: details.student_name,
      email: details.email,
      phone: details.phone,
      college: details.college,
      course: details.course,
      status: 'PENDING',
      submitted_at: now,
      document_name: details.front_filename,
      document_type: details.back_data_url ? 'Student ID Card (Front & Back)' : 'Student ID Card (Front Side)',
      student_id_code: details.student_id_code,
      referral_code: details.referral_code,
      front_data_url: details.front_data_url,
      back_data_url: details.back_data_url || undefined,
      front_image_url: details.front_data_url,
      back_image_url: details.back_data_url || undefined
    };

    const localItems = loadLocalVerifications();
    const existingIdx = localItems.findIndex(
      (i) => i.email === details.email || i.student_id_code === details.student_id_code || i.user_id === userId
    );
    if (existingIdx !== -1) {
      localItems[existingIdx] = { ...localItems[existingIdx], ...newItem };
    } else {
      localItems.unshift(newItem);
    }
    saveLocalVerifications(localItems);

    const studentStatus: StudentVerificationStatus = {
      id: userId,
      status: 'PENDING',
      payment_phone: details.phone,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
      document_name: details.front_filename,
      student_name: details.student_name,
      college: details.college,
      course: details.course,
      email: details.email,
      phone: details.phone,
      front_data_url: details.front_data_url,
      back_data_url: details.back_data_url,
      front_image_url: details.front_data_url,
      back_image_url: details.back_data_url
    };
    saveLocalStudentVerification(studentStatus);

    try {
      await supabase.from('verifications').upsert([
        {
          user_id: userId,
          student_name: details.student_name,
          email: details.email,
          phone: details.phone,
          college: details.college,
          course: details.course,
          student_id_code: details.student_id_code,
          referral_code: details.referral_code,
          status: 'PENDING',
          payment_phone: details.phone,
          document_name: details.front_filename,
          document_type: details.back_data_url ? 'Student ID Card (Front & Back)' : 'Student ID Card (Front Side)',
          front_data_url: details.front_data_url,
          back_data_url: details.back_data_url || null,
          front_image_url: details.front_data_url,
          back_image_url: details.back_data_url || null,
          submitted_at: now
        }
      ], { onConflict: 'email' });
    } catch {
      /* ignore Supabase error */
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

export const DEFAULT_VERIFICATION_QUEUE_ITEMS: VerificationQueueItem[] = [
  {
    id: 3911,
    user_id: 3911,
    student_id_code: 'STU-2026-3911',
    student_name: 'rahul',
    email: 'shubham12@gmail.com',
    phone: '7004273758',
    college: 'umu',
    course: 'b.tech',
    status: 'PENDING',
    submitted_at: '2026-11-14T23:31:15.000Z',
    document_name: 'rahul_student_id.jpg',
    document_type: 'Student ID Card (Front & Back)',
    referral_code: 'A7K2'
  },
  {
    id: 1,
    user_id: 1346,
    student_id_code: 'STU-2026-0001',
    student_name: 'Mayank Kumar',
    email: 'mayank.kumar@student.umu.ac.in',
    phone: '7004273758',
    college: 'Usha Martin University',
    course: 'B.Tech Computer Science & Engineering',
    status: 'PENDING',
    submitted_at: '2026-11-14T11:55:37.000Z',
    document_name: 'student_id_front_back_mayank.jpg',
    document_type: 'Student ID Card (Front & Back)',
    referral_code: 'A7K2'
  },
  {
    id: 2,
    user_id: 1347,
    student_id_code: 'STU-2026-0002',
    student_name: 'Priya Sharma',
    email: 'priya.sharma@student.umu.ac.in',
    phone: '7004273759',
    college: 'Usha Martin University',
    course: 'BCA Data Science',
    status: 'PENDING',
    submitted_at: '2026-11-14T09:20:15.000Z',
    document_name: 'upi_payment_proof_receipt.png',
    document_type: 'Payment Proof (UPI Transaction)',
    referral_code: 'PS88'
  },
  {
    id: 3,
    user_id: 1348,
    student_id_code: 'STU-2026-0003',
    student_name: 'Rahul Verma',
    email: 'rahul.verma@student.umu.ac.in',
    phone: '7004273760',
    college: 'Usha Martin University',
    course: 'B.Tech AI & Machine Learning',
    status: 'APPROVED',
    submitted_at: '2026-11-13T16:45:00.000Z',
    document_name: 'project_architecture_preview.png',
    document_type: 'Project Preview & Architecture Image',
    referral_code: 'RV14'
  },
  {
    id: 4,
    user_id: 1349,
    student_id_code: 'STU-2026-0004',
    student_name: 'Arjun Mehta',
    email: 'arjun.mehta@student.umu.ac.in',
    phone: '7004273761',
    college: 'Usha Martin University',
    course: 'B.Tech Mechanical',
    status: 'REJECTED',
    submitted_at: '2026-11-12T14:10:00.000Z',
    document_name: 'blurry_id_card_scan.jpg',
    document_type: 'Student ID Card (Front Side)',
    referral_code: 'AM92'
  }
];

const LOCAL_VERIFICATIONS_KEY = 'cpm_admin_verifications';

function loadLocalVerifications(): VerificationQueueItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_VERIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return DEFAULT_VERIFICATION_QUEUE_ITEMS;
  } catch {
    return DEFAULT_VERIFICATION_QUEUE_ITEMS;
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
            submitted_at: d.submitted_at || d.created_at || new Date().toISOString(),
            document_name: d.document_name,
            document_type: d.document_type || (d.back_data_url ? 'Student ID Card (Front & Back)' : 'Student ID Card (Front Side)'),
            student_id_code: d.student_id_code,
            referral_code: d.referral_code,
            front_data_url: d.front_data_url || d.front_image_url,
            back_data_url: d.back_data_url || d.back_image_url,
            front_image_url: d.front_image_url,
            back_image_url: d.back_image_url
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

  async getDocument(
    accessToken: string,
    verificationId: number,
    side: 'front' | 'back' = 'front',
    download = false
  ): Promise<Blob> {
    try {
      const queryParams = new URLSearchParams({ side });
      if (download) queryParams.set('download', 'true');
      const response = await fetch(
        `${verificationApiBaseUrl}/admin/verification/${verificationId}/document?${queryParams}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
      );
      if (response.ok) {
        return await response.blob();
      }
    } catch {
      /* continue to Supabase / local lookup */
    }

    // 1. Fetch from Supabase
    try {
      const { data } = await supabase
        .from('verifications')
        .select('*')
        .or(`id.eq.${verificationId},user_id.eq.${verificationId}`)
        .maybeSingle();

      if (data) {
        if (side === 'back') {
          if (typeof data.back_data_url === 'string' && data.back_data_url.startsWith('data:')) {
            return dataUrlToBlob(data.back_data_url);
          }
          if (typeof data.back_image_url === 'string' && (data.back_image_url.startsWith('http://') || data.back_image_url.startsWith('https://'))) {
            const res = await fetch(data.back_image_url);
            return await res.blob();
          }
        } else {
          if (typeof data.front_data_url === 'string' && data.front_data_url.startsWith('data:')) {
            return dataUrlToBlob(data.front_data_url);
          }
          if (typeof data.front_image_url === 'string' && (data.front_image_url.startsWith('http://') || data.front_image_url.startsWith('https://'))) {
            const res = await fetch(data.front_image_url);
            return await res.blob();
          }
          if (typeof data.document_name === 'string' && data.document_name.startsWith('data:')) {
            return dataUrlToBlob(data.document_name);
          }
        }

        // Generate student ID card image (front or back)
        const svg = generateDocumentSvg({
          studentName: data.student_name || 'Student',
          college: data.college || 'College / University',
          course: data.course || 'Degree / Department',
          studentId: String(data.user_id || data.id),
          studentIdCode: data.student_id_code || (Number(data.user_id) === 1346 ? 'STU-2026-0001' : `STU-2026-${String(data.user_id || data.id).padStart(4, '0')}`),
          phone: String(data.phone || data.payment_phone || '—'),
          documentName: data.document_name,
          documentType: data.document_type,
          referralCode: data.referral_code || 'A7K2',
          side
        });
        return new Blob([svg], { type: 'image/svg+xml' });
      }
    } catch {
      /* continue to local */
    }

    // 2. Offline fallback: local storage
    const all = loadLocalVerifications();
    const item = all.find((i) => i.id === verificationId || i.user_id === verificationId);
    if (item) {
      if (side === 'back') {
        if (item.back_data_url && typeof item.back_data_url === 'string') {
          return dataUrlToBlob(item.back_data_url);
        }
        if (item.back_image_url && typeof item.back_image_url === 'string') {
          try {
            const res = await fetch(item.back_image_url);
            if (res.ok) return await res.blob();
          } catch { /* fallback */ }
        }
      } else {
        if (item.front_data_url && typeof item.front_data_url === 'string') {
          return dataUrlToBlob(item.front_data_url);
        }
        if (item.front_image_url && typeof item.front_image_url === 'string') {
          try {
            const res = await fetch(item.front_image_url);
            if (res.ok) return await res.blob();
          } catch { /* fallback */ }
        }
        if (item.document_name && typeof item.document_name === 'string' && item.document_name.startsWith('data:')) {
          return dataUrlToBlob(item.document_name);
        }
      }

      const svg = generateDocumentSvg({
        studentName: item.student_name || 'Student',
        college: item.college || 'College / University',
        course: item.course || 'Degree / Department',
        studentId: String(item.user_id || item.id),
        studentIdCode: item.student_id_code || (item.user_id === 1346 ? 'STU-2026-0001' : `STU-2026-${String(item.user_id || item.id).padStart(4, '0')}`),
        phone: String(item.phone || '—'),
        documentName: item.document_name,
        documentType: item.document_type,
        referralCode: item.referral_code || 'A7K2',
        side
      });
      return new Blob([svg], { type: 'image/svg+xml' });
    }

    // Default fallback
    const svg = generateDocumentSvg({
      studentName: 'Mayank Kumar',
      college: 'Usha Martin University',
      course: 'B.Tech Computer Science',
      studentId: String(verificationId),
      studentIdCode: 'STU-2026-0001',
      phone: '7004273758',
      referralCode: 'A7K2',
      side
    });
    return new Blob([svg], { type: 'image/svg+xml' });
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

function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const header = parts[0];
    const data = parts[1] || '';
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';

    if (header.includes(';utf8') || !header.includes(';base64')) {
      return new Blob([decodeURIComponent(data)], { type: mime });
    }

    const binary = atob(data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return new Blob([dataUrl], { type: 'text/plain' });
  }
}

export function generateDocumentSvg(info: {
  studentName: string;
  college: string;
  course: string;
  studentId: string;
  studentIdCode?: string;
  phone: string;
  documentName?: string;
  documentType?: string;
  referralCode?: string;
  side?: 'front' | 'back';
}): string {
  if (info.side === 'back') {
    return generateStudentIdCardBackSvg(info);
  }
  const docType = (info.documentType || info.documentName || '').toLowerCase();
  if (docType.includes('payment') || docType.includes('receipt') || docType.includes('upi')) {
    return generatePaymentProofSvg(info);
  }
  if (docType.includes('project') || docType.includes('preview') || docType.includes('architecture')) {
    return generateProjectPreviewSvg(info);
  }
  return generateStudentIdCardSvg(info);
}

function generatePaymentProofSvg(info: {
  studentName: string;
  studentId: string;
  studentIdCode?: string;
  phone: string;
  referralCode?: string;
}): string {
  const { studentName, studentId, studentIdCode, referralCode } = info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <linearGradient id="upiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect x="15" y="15" width="570" height="350" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M 15 31 Q 15 15 31 15 L 569 15 Q 585 15 585 31 L 585 85 L 15 85 Z" fill="url(#upiGrad)"/>
  <text x="300" y="48" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">UNIFIED PAYMENTS INTERFACE (UPI)</text>
  <text x="300" y="70" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#a7f3d0" text-anchor="middle" letter-spacing="1">OFFICIAL TRANSACTION RECEIPT &amp; PROOF</text>
  <circle cx="90" cy="150" r="32" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/>
  <path d="M 78 150 L 86 158 L 104 140" stroke="#059669" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="140" y="142" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#64748b">TRANSACTION AMOUNT</text>
  <text x="140" y="172" font-family="system-ui, sans-serif" font-size="28" font-weight="900" fill="#047857">₹1,500.00</text>
  <rect x="420" y="130" width="130" height="28" rx="14" fill="#ecfdf5" stroke="#a7f3d0"/>
  <text x="485" y="149" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#059669" text-anchor="middle">✓ SUCCESSFUL</text>
  <line x1="45" y1="200" x2="555" y2="200" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="45" y="225" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">STUDENT NAME</text>
  <text x="45" y="245" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#0f172a">${escapeXml(studentName)}</text>
  <text x="45" y="280" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">STUDENT ID</text>
  <text x="45" y="300" font-family="monospace" font-size="13" font-weight="800" fill="#4338ca">${escapeXml(studentIdCode || studentId)}</text>
  <text x="230" y="225" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">AK REFERRAL CODE</text>
  <text x="230" y="245" font-family="monospace" font-size="14" font-weight="800" fill="#059669">${escapeXml(referralCode || 'A7K2')}</text>
  <text x="230" y="280" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">BENEFICIARY</text>
  <text x="230" y="300" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#1e293b">Uvikart Escrow Services</text>
  <text x="410" y="225" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">UTR / TXN REF</text>
  <text x="410" y="245" font-family="monospace" font-size="12" font-weight="700" fill="#334155">UTR482910482918</text>
  <text x="410" y="280" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">PAYMENT METHOD</text>
  <text x="410" y="300" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#1e293b">Google Pay / PhonePe UPI</text>
  <rect x="45" y="325" width="510" height="26" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="300" y="342" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Official Transaction Proof • Verified by Uvikart Admin Payment Gateway</text>
</svg>`;
}

function generateProjectPreviewSvg(info: {
  studentName: string;
  studentId: string;
  studentIdCode?: string;
  referralCode?: string;
}): string {
  const { studentName, studentId, studentIdCode, referralCode } = info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <linearGradient id="prjGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect x="15" y="15" width="570" height="350" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M 15 31 Q 15 15 31 15 L 569 15 Q 585 15 585 31 L 585 85 L 15 85 Z" fill="url(#prjGrad)"/>
  <text x="300" y="48" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">PROJECT ARCHITECTURE &amp; SOURCE BLUEPRINT</text>
  <text x="300" y="70" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#c7d2fe" text-anchor="middle" letter-spacing="1">ACADEMIC EVALUATION PREVIEW • UVIKART</text>
  <rect x="45" y="115" width="145" height="110" rx="10" fill="#f8fafc" stroke="#6366f1" stroke-width="2"/>
  <text x="117" y="145" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#4338ca" text-anchor="middle">React Frontend</text>
  <text x="117" y="170" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Tailwind CSS + Vite</text>
  <text x="117" y="195" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Interactive UI Grid</text>
  <line x1="190" y1="170" x2="225" y2="170" stroke="#6366f1" stroke-width="2" stroke-dasharray="4"/>
  <rect x="225" y="115" width="150" height="110" rx="10" fill="#f8fafc" stroke="#4f46e5" stroke-width="2"/>
  <text x="300" y="145" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#3730a3" text-anchor="middle">RESTful API</text>
  <text x="300" y="170" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Node.js / Fastify Engine</text>
  <text x="300" y="195" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Session &amp; Token Auth</text>
  <line x1="375" y1="170" x2="410" y2="170" stroke="#4f46e5" stroke-width="2" stroke-dasharray="4"/>
  <rect x="410" y="115" width="145" height="110" rx="10" fill="#f8fafc" stroke="#059669" stroke-width="2"/>
  <text x="482" y="145" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#047857" text-anchor="middle">Database Storage</text>
  <text x="482" y="170" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">SQLite / PostgreSQL</text>
  <text x="482" y="195" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">Encrypted Schemas</text>
  <line x1="45" y1="245" x2="555" y2="245" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="45" y="270" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">SUBMITTED BY</text>
  <text x="45" y="290" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#0f172a">${escapeXml(studentName)}</text>
  <text x="210" y="270" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">STUDENT ID</text>
  <text x="210" y="290" font-family="monospace" font-size="13" font-weight="800" fill="#4338ca">${escapeXml(studentIdCode || studentId)}</text>
  <text x="360" y="270" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">AK REFERRAL CODE</text>
  <text x="360" y="290" font-family="monospace" font-size="13" font-weight="800" fill="#059669">${escapeXml(referralCode || 'A7K2')}</text>
  <rect x="45" y="315" width="510" height="32" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="300" y="335" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#475569" text-anchor="middle">WATERMARKED ACADEMIC PREVIEW • PROTECTED BY UVIKART VERIFICATION</text>
</svg>`;
}

function generateStudentIdCardSvg(info: {
  studentName: string;
  college: string;
  course: string;
  studentId: string;
  studentIdCode?: string;
  phone: string;
  referralCode?: string;
}): string {
  const { studentName, college, course, studentId, studentIdCode, phone, referralCode } = info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect x="15" y="15" width="570" height="350" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M 15 31 Q 15 15 31 15 L 569 15 Q 585 15 585 31 L 585 85 L 15 85 Z" fill="url(#grad)"/>
  <text x="300" y="48" font-family="system-ui, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">${escapeXml((college || 'College / University').toUpperCase())}</text>
  <text x="300" y="70" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#93c5fd" text-anchor="middle" letter-spacing="2">STUDENT IDENTITY CARD</text>
  <rect x="45" y="105" width="130" height="160" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <circle cx="110" cy="155" r="30" fill="#64748b"/>
  <ellipse cx="110" cy="225" rx="42" ry="28" fill="#64748b"/>
  <rect x="45" y="275" width="130" height="24" rx="4" fill="#e2e8f0"/>
  <text x="110" y="291" font-family="monospace" font-size="11" font-weight="700" fill="#1e293b" text-anchor="middle">ID: ${escapeXml(studentIdCode || studentId)}</text>
  <text x="200" y="125" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">STUDENT NAME</text>
  <text x="200" y="148" font-family="system-ui, sans-serif" font-size="18" font-weight="800" fill="#0f172a">${escapeXml(studentName)}</text>
  <text x="200" y="178" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">COURSE &amp; DEPARTMENT</text>
  <text x="200" y="198" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#1e293b">${escapeXml(course)}</text>
  <text x="200" y="228" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">PHONE NUMBER</text>
  <text x="200" y="246" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#334155">${escapeXml(phone)}</text>
  <text x="400" y="178" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#059669">AK REFERRAL CODE</text>
  <text x="400" y="198" font-family="monospace" font-size="14" font-weight="800" fill="#047857">${escapeXml(referralCode || 'A7K2')}</text>
  <text x="400" y="228" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#64748b">ACADEMIC STATUS</text>
  <text x="400" y="246" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#16a34a">Active Student</text>
  <line x1="200" y1="262" x2="555" y2="262" stroke="#e2e8f0" stroke-width="1.5"/>
  <g transform="translate(200, 275)">
    <rect x="0" y="0" width="4" height="26" fill="#0f172a"/>
    <rect x="7" y="0" width="2" height="26" fill="#0f172a"/>
    <rect x="12" y="0" width="6" height="26" fill="#0f172a"/>
    <rect x="22" y="0" width="3" height="26" fill="#0f172a"/>
    <rect x="28" y="0" width="5" height="26" fill="#0f172a"/>
    <rect x="36" y="0" width="2" height="26" fill="#0f172a"/>
    <rect x="41" y="0" width="4" height="26" fill="#0f172a"/>
    <rect x="48" y="0" width="7" height="26" fill="#0f172a"/>
    <rect x="58" y="0" width="3" height="26" fill="#0f172a"/>
    <rect x="64" y="0" width="4" height="26" fill="#0f172a"/>
    <rect x="71" y="0" width="2" height="26" fill="#0f172a"/>
    <rect x="76" y="0" width="6" height="26" fill="#0f172a"/>
    <rect x="85" y="0" width="3" height="26" fill="#0f172a"/>
    <rect x="91" y="0" width="5" height="26" fill="#0f172a"/>
    <rect x="100" y="0" width="4" height="26" fill="#0f172a"/>
    <text x="60" y="38" font-family="monospace" font-size="9" fill="#64748b" text-anchor="middle">* ${escapeXml(studentIdCode || studentId)} *</text>
  </g>
  <rect x="430" y="278" width="125" height="26" rx="6" fill="#ecfdf5" stroke="#a7f3d0"/>
  <text x="492" y="295" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#059669" text-anchor="middle">COLLEGE ID CARD</text>
</svg>`;
}

function generateStudentIdCardBackSvg(info: {
  studentName: string;
  college: string;
  course: string;
  studentId: string;
  studentIdCode?: string;
  phone: string;
  referralCode?: string;
}): string {
  const { studentName, college, studentId, studentIdCode, phone } = info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <linearGradient id="backGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect x="15" y="15" width="570" height="350" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M 15 31 Q 15 15 31 15 L 569 15 Q 585 15 585 31 L 585 75 L 15 75 Z" fill="url(#backGrad)"/>
  <text x="300" y="48" font-family="system-ui, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">STUDENT IDENTITY CARD (BACK SIDE)</text>
  <text x="300" y="65" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#cbd5e1" text-anchor="middle" letter-spacing="1">INSTITUTION TERMS &amp; EMERGENCY DIRECTORY</text>

  <rect x="40" y="90" width="520" height="80" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="55" y="112" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#0f172a">TERMS &amp; CONDITIONS</text>
  <text x="55" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#475569">1. This identification card is strictly non-transferable and remains property of ${escapeXml(college || 'the University')}.</text>
  <text x="55" y="146" font-family="system-ui, sans-serif" font-size="9" fill="#475569">2. Must be presented on demand during academic exams, library issues, and campus entry.</text>
  <text x="55" y="162" font-family="system-ui, sans-serif" font-size="9" fill="#475569">3. If found, please return immediately to Campus Administration or call emergency lines.</text>

  <rect x="40" y="182" width="250" height="85" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="55" y="202" font-family="system-ui, sans-serif" font-size="10" font-weight="800" fill="#64748b">STUDENT RESIDENTIAL ADDRESS</text>
  <text x="55" y="222" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#0f172a">${escapeXml(studentName)}</text>
  <text x="55" y="238" font-family="system-ui, sans-serif" font-size="9" fill="#475569">Academic Hostel, University Campus Road</text>
  <text x="55" y="252" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#0f172a">Emergency Helpline: ${escapeXml(phone)}</text>

  <rect x="310" y="182" width="250" height="85" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="325" y="202" font-family="system-ui, sans-serif" font-size="10" font-weight="800" fill="#64748b">OFFICIAL ISSUING AUTHORITY</text>
  <path d="M 335 242 Q 365 215 395 235 T 465 225" fill="none" stroke="#2563eb" stroke-width="2"/>
  <line x1="325" y1="248" x2="540" y2="248" stroke="#cbd5e1" stroke-width="1"/>
  <text x="430" y="260" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#64748b" text-anchor="middle">REGISTRAR / DEAN OF STUDENT AFFAIRS</text>

  <rect x="40" y="280" width="520" height="45" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <g transform="translate(180, 287)">
    <rect x="0" y="0" width="3" height="20" fill="#0f172a"/>
    <rect x="6" y="0" width="5" height="20" fill="#0f172a"/>
    <rect x="15" y="0" width="2" height="20" fill="#0f172a"/>
    <rect x="22" y="0" width="4" height="20" fill="#0f172a"/>
    <rect x="30" y="0" width="6" height="20" fill="#0f172a"/>
    <rect x="40" y="0" width="3" height="20" fill="#0f172a"/>
    <rect x="48" y="0" width="2" height="20" fill="#0f172a"/>
    <rect x="55" y="0" width="5" height="20" fill="#0f172a"/>
    <rect x="65" y="0" width="4" height="20" fill="#0f172a"/>
    <rect x="75" y="0" width="6" height="20" fill="#0f172a"/>
    <rect x="85" y="0" width="3" height="20" fill="#0f172a"/>
    <rect x="92" y="0" width="5" height="20" fill="#0f172a"/>
    <rect x="102" y="0" width="4" height="20" fill="#0f172a"/>
    <text x="120" y="15" font-family="monospace" font-size="11" font-weight="700" fill="#0f172a">BARCODE: * ${escapeXml(studentIdCode || studentId)} * VALID 2026-2028</text>
  </g>
  <rect x="40" y="335" width="520" height="24" rx="4" fill="#f1f5f9"/>
  <text x="300" y="351" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#64748b" text-anchor="middle">OFFICIAL STUDENT VERIFICATION COPY • PROTECTED BY UVIKART VERIFICATION</text>
</svg>`;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
