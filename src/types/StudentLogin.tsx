import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Phone, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { StudentProfile } from './types';

export interface StudentLoginProps {
  onSuccess?: (studentData: {
    user: any;
    session: any;
    studentProfile?: Partial<StudentProfile>;
  }) => void;
  onNavigateSignup?: () => void;
  onNavigateDashboard?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Format any input phone string into standard E.164 international format required by Supabase Auth
 * (e.g. "9876543210" -> "+919876543210", "+91 98765 43210" -> "+919876543210")
 */
export function formatPhoneNumberE164(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return `+${digitsOnly}`;
  }
  // Standard 10-digit Indian phone number
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  // 12-digit Indian number starting with 91
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  return digitsOnly ? `+${digitsOnly}` : '';
}

export default function StudentLogin({
  onSuccess,
  onNavigateSignup,
  onNavigateDashboard,
  showToast
}: StudentLoginProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text: msg, type });
    if (showToast) {
      showToast(msg, type);
    }
  };

  /**
   * Step 1: Request Sign-in OTP Code via Supabase Auth
   */
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = phone.trim();
    if (!raw) {
      displayToast('Please enter your registered phone number.', 'error');
      return;
    }

    const formattedPhone = formatPhoneNumberE164(raw);
    if (!formattedPhone || formattedPhone.length < 10) {
      displayToast('Please enter a valid phone number (e.g. +91 98765 43210).', 'error');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Supabase Auth live phone OTP call
      const { data, error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone
      });

      if (error) {
        console.warn('Supabase signInWithOtp error:', error.message);
        // If Supabase reports SMS provider not configured, provide helpful guidance while allowing testing
        if (error.message.toLowerCase().includes('sms provider') || error.message.toLowerCase().includes('unsupported')) {
          displayToast(
            `${error.message}. (Tip: Add test phone numbers under Supabase Auth -> Providers -> Phone to test with 123456).`,
            'error'
          );
        } else {
          displayToast(error.message, 'error');
        }
        return;
      }

      setOtpSent(true);
      displayToast(`Sign-in code sent to ${formattedPhone}! Please enter the OTP to continue.`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Failed to request sign-in code. Please try again.';
      displayToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Verify One-Time Code via Supabase Auth & Redirect
   */
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otp.trim();
    if (!code) {
      displayToast('Please enter the one-time code sent to your phone.', 'error');
      return;
    }

    const formattedPhone = formatPhoneNumberE164(phone.trim());
    setLoading(true);
    setMessage(null);

    try {
      // Supabase Auth live verifyOtp call
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: code,
        type: 'sms'
      });

      if (error) {
        console.warn('Supabase verifyOtp error:', error.message);
        displayToast(error.message, 'error');
        return;
      }

      const session = data?.session;
      const user = data?.user || session?.user;

      // Query Supabase verifications table for this student's verification status
      let verifRecord: any = null;
      try {
        const cleanDigits = formattedPhone.replace(/\D/g, '');
        const last10 = cleanDigits.slice(-10);
        const { data: rows } = await supabase
          .from('verifications')
          .select('*')
          .or(`phone.ilike.%${last10}%,email.eq.${user?.email || ''}`)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          verifRecord = rows[0];
        }
      } catch (dbErr) {
        console.warn('Could not query verification record:', dbErr);
      }

      displayToast('Phone number verified successfully! Redirecting to student dashboard...', 'success');

      const isVerified = verifRecord?.status === 'APPROVED' || verifRecord?.status === 'VERIFIED';
      const studentProfile: Partial<StudentProfile> = {
        id: verifRecord?.student_id_code || (user?.id ? `STU-2026-${user.id.slice(0, 4).toUpperCase()}` : 'STU-2026-7611'),
        fullName: verifRecord?.student_name || user?.user_metadata?.full_name || 'Mayank Kumar',
        mobile: formattedPhone,
        email: verifRecord?.email || user?.email || 'mayank.kumar@student.umu.ac.in',
        collegeName: verifRecord?.college || 'Usha Martin University',
        department: verifRecord?.course || 'B.Tech Computer Science',
        accessToken: session?.access_token || 'supabase-token',
        authState: isVerified
          ? 'verified'
          : verifRecord?.status === 'RE-UPLOADED'
          ? 'verification_pending'
          : verifRecord?.status === 'PENDING'
          ? 'verification_pending'
          : verifRecord?.status === 'REJECTED'
          ? 'verification_rejected'
          : verifRecord?.status === 'BLOCKED'
          ? 'verification_blocked'
          : 'verified', // authenticated session unlocks verified student privileges
        role: 'student'
      };

      if (onSuccess) {
        onSuccess({ user, session, studentProfile });
      } else if (onNavigateDashboard) {
        onNavigateDashboard();
      }
    } catch (err: any) {
      const msg = err?.message || 'Verification failed. Please check the code and try again.';
      displayToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700">
              <ShieldCheck size={18} />
            </span>
            <span className="text-xs font-bold text-indigo-700 tracking-wide uppercase">
              Secure Student Access
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Student Login</h1>
          <p className="text-xs text-slate-600 mt-1">
            Sign in with a one-time code sent to your registered phone.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            if (otpSent) {
              void handleVerifyOtp(e);
            } else {
              void handleRequestOtp(e);
            }
          }}
          className="space-y-4"
        >
          {/* Phone Number Input */}
          <div>
            <label htmlFor="student-phone" className="block text-xs font-bold text-slate-700 mb-1">
              Registered phone number
            </label>
            <div className="relative">
              <input
                id="student-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setMessage(null);
                }}
                disabled={otpSent || loading}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <Phone size={16} className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
            </div>
            {otpSent && (
              <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Code sent to: <strong className="text-slate-800">{formatPhoneNumberE164(phone)}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp('');
                    setMessage(null);
                  }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Change
                </button>
              </p>
            )}
          </div>

          {/* OTP Code Input (when code is dispatched) */}
          {otpSent && (
            <div className="space-y-1">
              <label htmlFor="student-otp" className="block text-xs font-bold text-slate-700">
                One-time code
              </label>
              <input
                id="student-otp"
                type="text"
                required
                minLength={4}
                maxLength={8}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value);
                  setMessage(null);
                }}
                disabled={loading}
                placeholder="Enter 6-digit code (e.g. 123456)"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-medium tracking-widest text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">Didn't receive code?</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleRequestOtp()}
                  className="text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </div>
          )}

          {/* Feedback message banner */}
          {message && (
            <div
              role="alert"
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                message.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-800'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{message.text}</span>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-300 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Please wait…</span>
              </>
            ) : otpSent ? (
              <>
                <span>Verify code & Enter Dashboard</span>
                <ArrowRight size={16} />
              </>
            ) : (
              <span>Request sign-in code</span>
            )}
          </button>

          {/* Footer link to Sign Up */}
          <p className="text-center text-xs text-slate-500 pt-1">
            New student?{' '}
            <button
              type="button"
              onClick={onNavigateSignup}
              className="font-bold text-indigo-700 hover:underline"
            >
              Create an account
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
