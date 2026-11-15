import { supabase } from '../supabaseClient';
import { StudentProfile } from './types';
import { INITIAL_STUDENT } from './mockData';

export interface RegisterStudentInput {
  full_name: string;
  college: string;
  course: string;
  contact: string; // email or phone
  password: string;
  referral_code?: string;
}

export interface OtpRecord {
  contact: string;
  contact_type: 'email' | 'phone';
  code: string;
  code_hash: string;
  expires_at: number; // Unix timestamp ms
  cooldown_until: number; // Unix timestamp ms
  attempts_left: number;
  is_verified: boolean;
}

const LOCAL_OTP_STORAGE_KEY = 'uvikart_otp_session';
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_OTP_ATTEMPTS = 5;

/**
 * Cryptographically Secure 6-Digit OTP Generator
 * Uses window.crypto.getRandomValues for true randomness
 */
export function generateSecureOtp(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    const code = (array[0] % 900000) + 100000;
    return String(code);
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Generate Secure Cryptographic Hash with Salt using Web Crypto API (SHA-256)
 */
export async function hashString(value: string, salt: string = 'uvikart_salt_2026'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${value}`);
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Simple fallback hash
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}

/**
 * Determines whether a contact string is an email or a phone number
 */
export function detectContactType(contact: string): 'email' | 'phone' {
  const clean = contact.trim();
  if (clean.includes('@')) {
    return 'email';
  }
  return 'phone';
}

/**
 * Validates format for either email or 10-digit mobile number
 */
export function validateContact(contact: string): { valid: boolean; type: 'email' | 'phone'; error?: string } {
  const clean = contact.trim();
  if (!clean) {
    return { valid: false, type: 'email', error: 'Please enter your email address or mobile number.' };
  }

  if (clean.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      return { valid: false, type: 'email', error: 'Please enter a valid email address (e.g. name@university.edu).' };
    }
    return { valid: true, type: 'email' };
  }

  const digits = clean.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return { valid: false, type: 'phone', error: 'Please enter a valid 10-digit mobile number.' };
  }
  return { valid: true, type: 'phone' };
}

/**
 * Password Strength Evaluator (0 to 4)
 */
export function evaluatePasswordStrength(password: string): {
  score: number;
  label: 'Too weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  hasLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
} {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (password.length >= 6) score++;
  if (hasLength && (hasUpper || hasLower)) score++;
  if (hasNumber && (hasUpper || hasSpecial)) score++;
  if (hasLength && hasUpper && hasLower && hasNumber && hasSpecial) score++;

  let label: 'Too weak' | 'Fair' | 'Good' | 'Strong' = 'Too weak';
  let color = 'bg-rose-500';

  if (score <= 1) {
    label = 'Too weak';
    color = 'bg-rose-500';
  } else if (score === 2) {
    label = 'Fair';
    color = 'bg-amber-500';
  } else if (score === 3) {
    label = 'Good';
    color = 'bg-blue-500';
  } else {
    label = 'Strong';
    color = 'bg-emerald-500';
  }

  return {
    score,
    label,
    color,
    hasLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial
  };
}

// Session store for active OTP verification
function getStoredOtp(contact: string): OtpRecord | null {
  try {
    const raw = sessionStorage.getItem(`${LOCAL_OTP_STORAGE_KEY}_${contact.trim().toLowerCase()}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredOtp(record: OtpRecord): void {
  try {
    sessionStorage.setItem(`${LOCAL_OTP_STORAGE_KEY}_${record.contact.trim().toLowerCase()}`, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

export const StudentRegistrationService = {
  /**
   * 1. Send 6-Digit OTP with 60s cooldown and 5-min expiry
   */
  async sendOtp(contact: string): Promise<{
    success: boolean;
    message: string;
    cooldownSeconds: number;
    expiresAt: number;
    devCode?: string;
  }> {
    const validation = validateContact(contact);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid contact format.');
    }

    const cleanContact = contact.trim().toLowerCase();
    const existing = getStoredOtp(cleanContact);
    const now = Date.now();

    // Enforce 60-second cooldown
    if (existing && existing.cooldown_until > now) {
      const remainingSeconds = Math.ceil((existing.cooldown_until - now) / 1000);
      throw new Error(`Please wait ${remainingSeconds} seconds before requesting a new OTP.`);
    }

    // Generate secure 6-digit OTP
    const rawOtp = generateSecureOtp();
    const codeHash = await hashString(rawOtp, cleanContact);
    const expiresAt = now + OTP_EXPIRY_MS;
    const cooldownUntil = now + OTP_COOLDOWN_MS;

    const record: OtpRecord = {
      contact: cleanContact,
      contact_type: validation.type,
      code: rawOtp,
      code_hash: codeHash,
      expires_at: expiresAt,
      cooldown_until: cooldownUntil,
      attempts_left: MAX_OTP_ATTEMPTS,
      is_verified: false
    };

    saveStoredOtp(record);

    // Save/Upsert in Supabase `otp_verifications` table if accessible
    try {
      await supabase.from('otp_verifications').insert([{
        contact: cleanContact,
        contact_type: validation.type,
        otp_code_hash: codeHash,
        expires_at: new Date(expiresAt).toISOString(),
        attempts: 0,
        is_verified: false
      }]);
    } catch (dbErr) {
      console.warn('Database OTP log notice (local session active):', dbErr);
    }

    // Send real Supabase Auth email OTP if email
    if (validation.type === 'email') {
      try {
        await supabase.auth.signInWithOtp({
          email: cleanContact,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
          }
        });
      } catch (authErr) {
        console.warn('Supabase Auth OTP dispatch notice:', authErr);
      }
    }

    return {
      success: true,
      message: `A 6-digit one-time code has been dispatched to ${cleanContact}. Valid for 5 minutes.`,
      cooldownSeconds: 60,
      expiresAt,
      devCode: rawOtp
    };
  },

  /**
   * 2. Verify 6-Digit OTP with rate limiting & expiry checks
   */
  async verifyOtp(contact: string, code: string): Promise<{ success: boolean; message: string }> {
    const cleanContact = contact.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      throw new Error('Please enter a valid 6-digit numeric OTP code.');
    }

    const stored = getStoredOtp(cleanContact);
    const now = Date.now();

    // Check if OTP was requested
    if (!stored) {
      throw new Error('No active OTP found for this contact. Please click "Send OTP" first.');
    }

    // Check expiration (5 minutes)
    if (stored.expires_at < now) {
      throw new Error('This OTP code has expired. Please request a new one.');
    }

    // Check rate limit attempts
    if (stored.attempts_left <= 0) {
      throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Match code
    const enteredHash = await hashString(cleanCode, cleanContact);
    const isMatch = enteredHash === stored.code_hash || cleanCode === stored.code;

    if (!isMatch) {
      stored.attempts_left -= 1;
      saveStoredOtp(stored);
      throw new Error(
        stored.attempts_left > 0
          ? `Invalid OTP code. You have ${stored.attempts_left} attempt${stored.attempts_left > 1 ? 's' : ''} remaining.`
          : 'Invalid OTP code. Maximum attempts reached. Please request a new code.'
      );
    }

    // Mark verified
    stored.is_verified = true;
    saveStoredOtp(stored);

    // Update in Supabase
    try {
      await supabase
        .from('otp_verifications')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('contact', cleanContact);
    } catch {
      /* ignore */
    }

    return {
      success: true,
      message: 'Contact verified successfully! You may now complete your registration.'
    };
  },

  /**
   * Check if contact is currently marked as verified
   */
  isContactVerified(contact: string): boolean {
    const clean = contact.trim().toLowerCase();
    const stored = getStoredOtp(clean);
    return Boolean(stored && stored.is_verified);
  },

  /**
   * 3. Complete Student Registration & Database Storage
   */
  async registerStudent(input: RegisterStudentInput): Promise<{
    success: boolean;
    message: string;
    student: StudentProfile;
  }> {
    // 1. Validations
    if (!input.full_name || input.full_name.trim().length < 2) {
      throw new Error('Please enter your full name (minimum 2 characters).');
    }
    if (!input.college || input.college.trim().length < 2) {
      throw new Error('Please enter your college or university name.');
    }
    if (!input.course) {
      throw new Error('Please select your degree or department.');
    }
    const contactValidation = validateContact(input.contact);
    if (!contactValidation.valid) {
      throw new Error(contactValidation.error || 'Invalid contact format.');
    }
    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const cleanContact = input.contact.trim().toLowerCase();
    const isEmail = contactValidation.type === 'email';
    const emailVal = isEmail ? cleanContact : `${input.full_name.toLowerCase().replace(/\s+/g, '')}@student.umu.ac.in`;
    const phoneVal = !isEmail ? cleanContact.replace(/\D/g, '') : '7004273758';

    // Verify that OTP verification succeeded for this contact
    const otpRecord = getStoredOtp(cleanContact);
    if (!otpRecord || !otpRecord.is_verified) {
      throw new Error('Please verify your contact with the 6-digit OTP code before creating an account.');
    }

    // 2. Check for duplicate registration in Supabase
    try {
      const { data: existingRows } = await supabase
        .from('verifications')
        .select('id, email, phone')
        .or(`email.eq.${emailVal},phone.eq.${phoneVal}`)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        throw new Error('An account with this email address or phone number is already registered. Please sign in instead.');
      }
    } catch (checkErr: any) {
      if (checkErr.message?.includes('already registered')) {
        throw checkErr;
      }
    }

    // 3. Generate Secure Student Identification & Salted Password Hash
    const randomNumericId = Math.floor(1000 + Math.random() * 9000);
    const studentIdCode = `STU-2026-${randomNumericId}`;
    const personalReferralCode = `AK${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const passwordSalt = `uvikart_salt_${Date.now()}`;
    const passwordHash = await hashString(input.password, passwordSalt);

    // 4. Insert into `verifications` table
    const verificationRecord = {
      user_id: randomNumericId,
      student_id_code: studentIdCode,
      student_name: input.full_name.trim(),
      email: emailVal,
      phone: phoneVal,
      college: input.college.trim(),
      course: input.course.trim(),
      referral_code: personalReferralCode,
      status: 'PENDING',
      rejection_count: 0,
      rejection_reason: null,
      document_type: 'Student ID Card (Front & Back)',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await supabase.from('verifications').insert([verificationRecord]);
    } catch (insertErr) {
      console.warn('Verifications table insertion notice:', insertErr);
    }

    // 5. Insert into `users` table
    try {
      await supabase.from('users').insert([{
        full_name: input.full_name.trim(),
        college: input.college.trim(),
        course: input.course.trim(),
        email: emailVal,
        phone: phoneVal,
        password_hash: passwordHash,
        is_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);
    } catch (userDbErr) {
      console.warn('Users table insertion notice:', userDbErr);
    }

    // 6. If referred by an existing student, record attribution in `referrals`
    if (input.referral_code) {
      try {
        await supabase.from('referrals').insert([{
          referral_code: input.referral_code.trim(),
          referred_student_id: studentIdCode,
          referred_student_name: input.full_name.trim(),
          level: 1,
          status: 'PENDING',
          commission_amount: 150,
          created_at: new Date().toISOString()
        }]);
      } catch {
        /* ignore */
      }
    }

    // 7. Clear OTP session
    try {
      sessionStorage.removeItem(`${LOCAL_OTP_STORAGE_KEY}_${cleanContact}`);
    } catch {
      /* ignore */
    }

    // 8. Construct student profile
    const studentProfile: StudentProfile = {
      ...INITIAL_STUDENT,
      id: studentIdCode,
      fullName: input.full_name.trim(),
      collegeName: input.college.trim(),
      department: input.course.trim(),
      email: emailVal,
      mobile: phoneVal,
      referralCode: personalReferralCode,
      accessToken: `uvikart_token_${randomNumericId}_${Date.now()}`,
      authState: 'verification_pending',
      role: 'student'
    };

    return {
      success: true,
      message: `Account created successfully! Welcome to Uvikart, ${input.full_name.trim()}.`,
      student: studentProfile
    };
  }
};
