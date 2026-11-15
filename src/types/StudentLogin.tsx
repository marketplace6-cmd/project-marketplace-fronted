import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  KeyRound,
  X,
  Send,
  Sparkles
} from 'lucide-react';
import { StudentProfile } from './types';
import { INITIAL_STUDENT } from './mockData';

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

export default function StudentLogin({
  onSuccess,
  onNavigateSignup,
  onNavigateDashboard,
  showToast
}: StudentLoginProps) {
  // Login Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Forgot Password Modal States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1); // 1 = Request code, 2 = Verify code & set new password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (showToast) {
      showToast(msg, type);
    }
  };

  /**
   * Helper: Process successful sign in and load isolated student profile
   */
  const processSuccessfulLogin = async (user: any, session: any) => {
    const cleanEmail = (user?.email || email).trim().toLowerCase();

    // Query Supabase verifications table strictly for this user (multi-user isolation)
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
      console.warn('Verifications query notice:', dbErr);
    }

    const isVerified = verifRecord?.status === 'APPROVED' || verifRecord?.status === 'VERIFIED';
    const randomSuffix = user?.id ? user.id.slice(0, 4).toUpperCase() : Math.floor(1000 + Math.random() * 9000);
    const studentId = verifRecord?.student_id_code || `STU-2026-${randomSuffix}`;
    const referralCode = verifRecord?.referral_code || verifRecord?.student_id_code || studentId;
    const studentName = verifRecord?.student_name || user?.user_metadata?.full_name || user?.user_metadata?.name || cleanEmail.split('@')[0];
    const college = verifRecord?.college || user?.user_metadata?.college || 'University Student';
    const course = verifRecord?.course || user?.user_metadata?.course || 'Degree Program';
    const phone = verifRecord?.phone || '';
    const rejCount = Number(verifRecord?.rejection_count || 0);

    const studentProfile: Partial<StudentProfile> = {
      ...INITIAL_STUDENT,
      id: studentId,
      fullName: studentName,
      email: cleanEmail,
      mobile: phone,
      collegeName: college,
      department: course,
      referralCode: referralCode,
      accessToken: session?.access_token || 'supabase-token',
      authState: isVerified
        ? 'verified'
        : verifRecord?.status === 'BLOCKED' || rejCount >= 2
        ? 'verification_blocked'
        : verifRecord?.status === 'REJECTED'
        ? 'verification_rejected'
        : verifRecord?.status === 'RE-UPLOADED'
        ? 'verification_pending'
        : verifRecord?.status === 'PENDING'
        ? 'verification_pending'
        : 'verification_pending',
      rejectionCount: rejCount,
      rejectionReason: verifRecord?.rejection_reason || undefined,
      role: 'student'
    };

    // Save isolated session in localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cpm_student_session', JSON.stringify(studentProfile));
      } catch {
        /* ignore */
      }
    }

    displayToast(`Welcome back, ${studentName}! Logged in successfully.`, 'success');

    if (onSuccess) {
      onSuccess({ user, session, studentProfile });
    } else if (onNavigateDashboard) {
      onNavigateDashboard();
    }
  };

  /**
   * Google OAuth Sign In via Supabase
   */
  const handleGoogleSignIn = async () => {
    setLoginError('');
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        setLoginError(error.message);
        displayToast(error.message, 'error');
        setGoogleLoading(false);
      }
    } catch (err: any) {
      const msg = err?.message || 'Google sign-in initialization failed.';
      setLoginError(msg);
      displayToast(msg, 'error');
      setGoogleLoading(false);
    }
  };

  /**
   * 1. Email + Password Sign In via Supabase Auth
   */
  const handleEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const err = 'Please enter a valid student email address.';
      setLoginError(err);
      displayToast(err, 'error');
      return;
    }

    if (!password) {
      const err = 'Please enter your account password.';
      setLoginError(err);
      displayToast(err, 'error');
      return;
    }

    setLoadingLogin(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'Incorrect email or password. Please check your credentials or reset your password.';
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'Your email address has not been confirmed yet. Please verify your email first.';
        }
        setLoginError(msg);
        displayToast(msg, 'error');
        setLoadingLogin(false);
        return;
      }

      if (data?.session && data?.user) {
        await processSuccessfulLogin(data.user, data.session);
      }
    } catch (err: any) {
      const msg = err?.message || 'Login failed. Please check your internet connection.';
      setLoginError(msg);
      displayToast(msg, 'error');
    } finally {
      setLoadingLogin(false);
    }
  };

  /**
   * 2. Forgot Password - Step 1: Send Password Reset Code/Email
   */
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    const cleanEmail = (forgotEmail || email).trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setForgotError('Please enter a valid registered email address.');
      return;
    }

    setForgotLoading(true);

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://uvikart.com';
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });

      if (error) {
        setForgotError(error.message);
        displayToast(error.message, 'error');
        setForgotLoading(false);
        return;
      }

      setForgotSuccess(`Password reset code dispatched to ${cleanEmail}. Check your inbox!`);
      displayToast(`Password reset code sent to ${cleanEmail}!`, 'success');
      setForgotStep(2);
    } catch (err: any) {
      const msg = err?.message || 'Unable to request password reset code. Please try again.';
      setForgotError(msg);
      displayToast(msg, 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  /**
   * 4. Forgot Password - Step 2: Verify OTP & Update Password
   */
  const handleVerifyResetAndSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    const cleanEmail = (forgotEmail || email).trim().toLowerCase();
    const token = forgotOtp.trim();

    if (!token || token.length < 6) {
      setForgotError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 6) {
      setForgotError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('New passwords do not match. Please re-enter.');
      return;
    }

    setForgotLoading(true);

    try {
      // 1. Verify OTP with type: 'recovery'
      let verifyResult = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: token,
        type: 'recovery'
      });

      // Fallback to 'email' if project OTP template is standard email
      if (verifyResult.error) {
        verifyResult = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token,
          type: 'email'
        });
      }

      if (verifyResult.error) {
        setForgotError('Invalid or expired verification code. Please check and try again.');
        displayToast('Invalid or expired verification code.', 'error');
        setForgotLoading(false);
        return;
      }

      // 2. Update user's password securely
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        setForgotError(updateError.message);
        displayToast(updateError.message, 'error');
        setForgotLoading(false);
        return;
      }

      displayToast('Password updated successfully! You can now log in with your new password.', 'success');
      setShowForgotModal(false);
      setForgotStep(1);
      setForgotOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setEmail(cleanEmail);
    } catch (err: any) {
      const msg = err?.message || 'Failed to update password. Please try again.';
      setForgotError(msg);
      displayToast(msg, 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4 relative">
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
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Student Login</h1>
          <p className="text-xs text-slate-600 mt-1">
            Sign in with your email address and password to access your verified student portal.
          </p>
        </div>

        {/* Login Error Alert */}
        {loginError && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2.5"
          >
            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-medium">{loginError}</span>
          </div>
        )}

        {/* 1. Continue with Google Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loadingLogin}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-xs transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {googleLoading ? (
            <RefreshCw size={18} className="animate-spin text-indigo-600" />
          ) : (
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
          )}
          <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-3">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider relative shrink-0">
            or sign in with email
          </span>
        </div>

        {/* 2. Email + Password Login Form */}
        <form onSubmit={handleEmailPasswordSignIn} className="space-y-4">
          {/* Email Address */}
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
                  setLoginError('');
                }}
                disabled={loadingLogin}
                placeholder="e.g. student@umu.ac.in or you@gmail.com"
                className="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 outline-none transition-all"
              />
              <Mail size={16} className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Password with Forgot Password link */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="student-password" className="text-xs font-bold text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotError('');
                  setForgotSuccess('');
                  setForgotStep(1);
                  setShowForgotModal(true);
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input
                id="student-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginError('');
                }}
                disabled={loadingLogin}
                placeholder="Enter your account password"
                className="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loadingLogin || !email || !password}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-3 px-4 text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingLogin ? (
              <>
                <RefreshCw size={16} className="animate-spin text-white" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Card Footer: Navigation to Signup */}
        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
          <span>New student?</span>{' '}
          <button
            type="button"
            onClick={onNavigateSignup}
            className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors ml-1"
          >
            Create an account
          </button>
        </div>
      </div>

      {/* 4. Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-7 relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-purple-50 text-purple-700">
                  <KeyRound size={18} />
                </span>
                <h3 className="font-extrabold text-base text-slate-900">Reset Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {forgotError && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter your registered student email address. We will send a 6-digit verification code to reset your password.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="student@umu.ac.in"
                      className="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none"
                    />
                    <Mail size={16} className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    <span>Send Reset Code</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyResetAndSetPassword} className="space-y-3.5">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter the 6-digit code received at <strong className="text-slate-800">{forgotEmail}</strong> and your new password.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full font-mono text-center tracking-widest text-lg font-bold rounded-xl border border-slate-300 py-2 text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-xs text-slate-500 hover:text-purple-700 underline"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotOtp || !newPassword || !confirmNewPassword}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
