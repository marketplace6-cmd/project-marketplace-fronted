import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Mail, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
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
 * Official Google "G" Logo SVG
 */
function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function StudentLogin({
  onSuccess,
  onNavigateSignup,
  onNavigateDashboard,
  showToast
}: StudentLoginProps) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text: msg, type });
    if (showToast) {
      showToast(msg, type);
    }
  };

  /**
   * 1. Google OAuth Sign-In Trigger
   */
  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    setMessage(null);

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://uvikart.com';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        console.warn('Google OAuth error:', error.message);
        displayToast(error.message, 'error');
        setLoadingGoogle(false);
        return;
      }
      // Browser will navigate to Google authentication screen
    } catch (err: any) {
      const msg = err?.message || 'Failed to initiate Google Sign-In. Please try again.';
      displayToast(msg, 'error');
      setLoadingGoogle(false);
    }
  };

  /**
   * 2. Request Email Sign-In Code / Magic Link via Supabase Auth
   */
  const handleRequestEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      displayToast('Please enter a valid student email address.', 'error');
      return;
    }

    setLoadingEmail(true);
    setMessage(null);

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://uvikart.com';
      const { data, error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        console.warn('Email OTP error:', error.message);
        displayToast(error.message, 'error');
        setLoadingEmail(false);
        return;
      }

      setOtpSent(true);
      displayToast(`Sign-in code sent to ${cleanEmail}! Please check your email inbox.`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Failed to send sign-in code to your email.';
      displayToast(msg, 'error');
    } finally {
      setLoadingEmail(false);
    }
  };

  /**
   * 3. Verify Email One-Time Code via Supabase Auth & Query Database
   */
  const handleVerifyEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otp.trim();
    if (!code) {
      displayToast('Please enter the 6-digit one-time code sent to your email.', 'error');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setLoadingEmail(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code,
        type: 'email'
      });

      if (error) {
        console.warn('Supabase verifyOtp error:', error.message);
        displayToast(error.message, 'error');
        setLoadingEmail(false);
        return;
      }

      const session = data?.session;
      const user = data?.user || session?.user;

      // Query Supabase verifications table matching email
      let verifRecord: any = null;
      try {
        const { data: rows } = await supabase
          .from('verifications')
          .select('*')
          .or(`email.ilike.${cleanEmail},email.eq.${cleanEmail},user_id.eq.${user?.id || ''}`)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          verifRecord = rows[0];
        }
      } catch (dbErr) {
        console.warn('Verifications table lookup error:', dbErr);
      }

      const isVerified = verifRecord?.status === 'APPROVED' || verifRecord?.status === 'VERIFIED';
      const studentName = verifRecord?.student_name || user?.user_metadata?.full_name || user?.user_metadata?.name || 'Mayank Kumar';
      const studentId = verifRecord?.student_id_code || (user?.id ? `STU-2026-${user.id.slice(0, 4).toUpperCase()}` : 'STU-2026-7611');
      const referralCode = verifRecord?.referral_code || 'A7K2';

      displayToast(`Welcome back, ${studentName}! Authenticated successfully.`, 'success');

      const studentProfile: Partial<StudentProfile> = {
        id: studentId,
        fullName: studentName,
        email: cleanEmail,
        mobile: verifRecord?.phone || '+91 7004273758',
        collegeName: verifRecord?.college || 'Usha Martin University',
        department: verifRecord?.course || 'B.Tech Computer Science',
        referralCode: referralCode,
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
          : 'verified',
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
      setLoadingEmail(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700">
              <ShieldCheck size={18} />
            </span>
            <span className="text-xs font-bold text-indigo-700 tracking-wide uppercase">
              Secure Academic Access
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Student Login</h1>
          <p className="text-xs text-slate-600 mt-1">
            Sign in with your Google account or email address to access your verified student portal.
          </p>
        </div>

        {/* 1. Primary "Continue with Google" Button */}
        <div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loadingGoogle || loadingEmail}
            className="w-full rounded-2xl border border-slate-300 bg-white py-3 px-4 text-sm font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
          >
            {loadingGoogle ? (
              <>
                <RefreshCw size={17} className="animate-spin text-indigo-600" />
                <span>Connecting to Google…</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        {/* 2. Visual Divider */}
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 font-semibold text-slate-400">
              or sign in with email
            </span>
          </div>
        </div>

        {/* 3. Email Authentication Form */}
        <form
          onSubmit={(e) => {
            if (otpSent) {
              void handleVerifyEmailOtp(e);
            } else {
              void handleRequestEmailOtp(e);
            }
          }}
          className="space-y-4"
        >
          {/* Email Address Input */}
          <div>
            <label htmlFor="student-email" className="block text-xs font-bold text-slate-700 mb-1">
              Student Email Address
            </label>
            <div className="relative">
              <input
                id="student-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setMessage(null);
                }}
                disabled={otpSent || loadingEmail || loadingGoogle}
                placeholder="e.g. student@umu.ac.in or you@gmail.com"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <Mail size={16} className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
            </div>

            {otpSent && (
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
                <span>Code sent to: <strong className="text-slate-800">{email}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp('');
                    setMessage(null);
                  }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Change email
                </button>
              </p>
            )}
          </div>

          {/* OTP Code Input (when email code is dispatched) */}
          {otpSent && (
            <div className="space-y-1">
              <label htmlFor="student-otp" className="block text-xs font-bold text-slate-700">
                Email One-Time Code
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
                disabled={loadingEmail}
                placeholder="Enter 6-digit email code"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium tracking-widest text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">Didn't receive code?</span>
                <button
                  type="button"
                  disabled={loadingEmail}
                  onClick={() => void handleRequestEmailOtp()}
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
            disabled={loadingEmail || loadingGoogle}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-300 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loadingEmail ? (
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
              <span>Send Sign-In Code</span>
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
