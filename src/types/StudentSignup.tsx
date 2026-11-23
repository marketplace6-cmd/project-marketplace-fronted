import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  GraduationCap,
  BookOpen,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
  Send
} from 'lucide-react';
import { evaluatePasswordStrength } from './studentRegistrationService';
import { StudentProfile } from './types';
import { supabase } from '../supabaseClient';
import { INITIAL_STUDENT } from './mockData';
import TransparentBrandLogo from './TransparentBrandLogo';

export interface StudentSignupProps {
  onSuccess?: (data: { studentProfile: StudentProfile }) => void;
  onNavigateLogin?: () => void;
  onNavigateDashboard?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  referralCode?: string;
}

const COURSE_OPTIONS = [
  'B.Tech - Computer Science & Engineering',
  'B.Tech - Information Technology',
  'B.Tech - Electronics & Communication',
  'B.Tech - Mechanical Engineering',
  'B.Tech - Civil Engineering',
  'BCA - Bachelor of Computer Applications',
  'MCA - Master of Computer Applications',
  'MBA - Master of Business Administration',
  'BBA - Bachelor of Business Administration',
  'Diploma - Polytechnic / Engineering',
  'Other Degree / Department'
];

export default function StudentSignup({
  onSuccess,
  onNavigateLogin,
  onNavigateDashboard,
  showToast,
  referralCode
}: StudentSignupProps) {
  // Registration Form Fields
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('B.Tech - Computer Science & Engineering');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Verification & Submission States
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);

  // Timers: Cooldown (60s) & Expiry (300s = 5m)
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [expiryRemaining, setExpiryRemaining] = useState(0);

  // Feedback banner
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Refs for 6 OTP input boxes
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ text: msg, type });
    if (showToast) {
      showToast(msg, type);
    }
  };

  // Cooldown countdown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  // Expiry countdown
  useEffect(() => {
    if (expiryRemaining <= 0) return;
    const interval = setInterval(() => {
      setExpiryRemaining((prev) => {
        if (prev <= 1) {
          setOtpError('Verification code expired. Please request a new code.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryRemaining]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const passwordStrength = evaluatePasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  // Validation check
  const isFormValid =
    fullName.trim().length >= 2 &&
    college.trim().length >= 2 &&
    Boolean(course) &&
    email.includes('@') &&
    email.includes('.') &&
    password.length >= 6 &&
    passwordsMatch;

  /**
   * Helper: Activate and finalize student account after verification
   */
  const finalizeStudentAccount = async (userUuid: string, verifiedEmail: string) => {
    const cleanEmail = verifiedEmail.trim().toLowerCase();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const studentIdCode = `STU-2026-${randomSuffix}`;
    // Assign unique Student ID as their permanent unique Referral Code
    const permanentReferralCode = studentIdCode;

    // Database row in Supabase verifications table
    const verificationRecord = {
      user_id: userUuid ? String(userUuid) : null,
      student_id_code: studentIdCode,
      student_name: fullName.trim(),
      email: cleanEmail,
      phone: '',
      college: college.trim(),
      course: course.trim(),
      referral_code: permanentReferralCode,
      status: 'UNVERIFIED',
      rejection_count: 0,
      rejection_reason: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error: upsertErr } = await supabase.from('verifications').upsert([verificationRecord], { onConflict: 'email' });
      if (upsertErr) {
        console.error('Verifications table upsert error, attempting update/insert fallback:', upsertErr);
        const { error: updateErr } = await supabase.from('verifications').update(verificationRecord).eq('email', cleanEmail);
        if (updateErr) {
          await supabase.from('verifications').insert([verificationRecord]);
        }
      }
    } catch (dbErr) {
      console.warn('Verifications table upsert notice:', dbErr);
    }

    // Record referral attribution if registered via an inviter's referral code
    if (referralCode && referralCode.trim() !== permanentReferralCode) {
      try {
        await supabase.from('referrals').insert([{
          referral_code: referralCode.trim(),
          referrer_student_id: referralCode.trim(),
          referred_student_id: studentIdCode,
          referred_student_name: fullName.trim(),
          level: 1,
          status: 'PENDING',
          reward_status: 'PENDING',
          commission_amount: 150,
          reward_amount: 150,
          created_at: new Date().toISOString()
        }]);
      } catch (refErr) {
        console.warn('Referrals table insert notice:', refErr);
      }
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || `token_${userUuid}`;

    const studentProfile: StudentProfile = {
      ...INITIAL_STUDENT,
      id: studentIdCode,
      fullName: fullName.trim(),
      collegeName: college.trim(),
      department: course.trim(),
      email: cleanEmail,
      mobile: '',
      referralCode: permanentReferralCode,
      accessToken: token,
      authState: 'logged_in',
      previewStats: {
        totalAllowed: 5,
        usedPreviews: 0,
        remainingPreviews: 5,
        nextResetDate: '90-Day Cycle'
      },
      role: 'student'
    };

    // Save strictly isolated session in local storage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('cpm_student_session', JSON.stringify(studentProfile));
      } catch {
        /* ignore */
      }
    }

    displayToast(`Welcome to Unikart, ${fullName.trim()}! Your Student ID & Referral Code is ${studentIdCode}.`, 'success');

    if (onSuccess) {
      onSuccess({ studentProfile });
    } else if (onNavigateDashboard) {
      onNavigateDashboard();
    }
  };

  /**
   * 1. Submit Registration Form -> Calls supabase.auth.signUp
   */
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFeedback(null);
    setOtpError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Please enter a valid student email address.');
      return;
    }
    if (!passwordsMatch) {
      setFormError('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://unikart.com';
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName.trim(),
            college: college.trim(),
            course: course.trim(),
            referred_by: referralCode?.trim() || undefined
          }
        }
      });

      if (error) {
        setFormError(error.message);
        displayToast(error.message, 'error');
        setSubmitting(false);
        return;
      }

      // If user session is already active (confirmations disabled in Supabase)
      if (data?.session && data?.user) {
        await finalizeStudentAccount(data.user.id, cleanEmail);
        return;
      }

      // If Supabase sent an email confirmation code / OTP
      setOtpSent(true);
      setCooldownRemaining(60);
      setExpiryRemaining(300); // 5 minutes
      setOtpDigits(['', '', '', '', '', '']);
      displayToast(`Verification code sent to ${cleanEmail}. Please enter the 6-digit code.`, 'success');

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      const msg = err?.message || 'Sign up failed. Please check your network and try again.';
      setFormError(msg);
      displayToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 2. Verify 6-digit OTP code against Supabase Auth
   */
  const handleVerifyOtp = async () => {
    setOtpError('');
    setFeedback(null);
    const otpCode = otpDigits.join('');
    if (otpCode.length !== 6) {
      setOtpError('Please enter all 6 digits of the OTP code.');
      return;
    }

    setVerifyingOtp(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Try verifyOtp with type 'signup' (standard for Supabase signUp confirmation)
      let verifyResult = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: otpCode.trim(),
        type: 'signup'
      });

      // 2. Fallback to 'email' if signup type is not accepted by current project config
      if (verifyResult.error) {
        verifyResult = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: otpCode.trim(),
          type: 'email'
        });
      }

      if (verifyResult.error) {
        console.warn('Supabase verifyOtp error:', verifyResult.error.message);
        setOtpError('Invalid or expired 6-digit code. Please check and try again.');
        displayToast('Invalid or expired 6-digit code. Please check and try again.', 'error');
        return;
      }

      const user = verifyResult.data?.user || (await supabase.auth.getUser()).data?.user;
      const userUuid = user?.id || `usr_${Date.now()}`;

      await finalizeStudentAccount(userUuid, cleanEmail);
    } catch (err: any) {
      const msg = err?.message || 'Verification failed. Please try again.';
      setOtpError(msg);
      displayToast(msg, 'error');
    } finally {
      setVerifyingOtp(false);
    }
  };

  /**
   * Resend Verification Code
   */
  const handleResendOtp = async () => {
    if (cooldownRemaining > 0 || resendingOtp) return;
    setResendingOtp(true);
    setOtpError('');
    const cleanEmail = email.trim().toLowerCase();

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://unikart.com';
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: { emailRedirectTo: redirectUrl }
      });

      if (error) {
        // Fallback to signInWithOtp if resend is restricted
        await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: { emailRedirectTo: redirectUrl }
        });
      }

      setCooldownRemaining(60);
      setExpiryRemaining(300);
      displayToast(`New verification code sent to ${cleanEmail}!`, 'success');
    } catch (err: any) {
      displayToast(err?.message || 'Failed to resend code.', 'error');
    } finally {
      setResendingOtp(false);
    }
  };

  // OTP Digits input handling
  const handleOtpDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    if (!cleaned) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }
    newDigits[index] = cleaned.charAt(cleaned.length - 1);
    setOtpDigits(newDigits);
    if (index < 5 && cleaned) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);
    const nextIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[nextIdx]?.focus();
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-indigo-50/70 via-purple-50/40 to-white py-12 px-4 sm:px-6 relative overflow-hidden flex items-center justify-center">
      {/* Decorative Purple Wave Background Elements */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-purple-200/40 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />

      {/* Centered White Signup Card */}
      <div className="w-full max-w-xl mx-auto bg-white rounded-3xl border border-purple-100 shadow-xl shadow-purple-900/5 p-6 sm:p-10 relative z-10 space-y-6">
        {/* Card Header */}
        <div className="text-center sm:text-left space-y-2">
          <div className="flex justify-center sm:justify-start mb-2">
            <TransparentBrandLogo className="h-14 w-auto object-contain" alt="Unikart" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
            <Sparkles size={13} className="text-purple-600" />
            <span>VERIFIED STUDENT REGISTRATION</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {otpSent ? 'Verify Email Address' : 'Create Student Account'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {otpSent
              ? `We have dispatched a 6-digit confirmation code to ${email}. Enter it below to activate your account and receive your unique Student ID.`
              : 'Create your verified student profile, configure your password, and receive your unique Student ID & permanent Referral Code.'}
          </p>
        </div>

        {/* STEP 1: Main Signup Form */}
        {!otpSent && (
          <form onSubmit={handleSignUpSubmit} className="space-y-4">
            {/* 1. Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Full Name <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Janki"
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
                />
                <User size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
              </div>
            </div>

            {/* 2. College / University */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                College / University Name <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={150}
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  placeholder="e.g. Janak University"
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
                />
                <GraduationCap size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
              </div>
            </div>

            {/* 3. Course / Department */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Course / Department <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <select
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-8 py-2.5 text-sm font-normal text-slate-900 bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none cursor-pointer"
                >
                  {COURSE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <BookOpen size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
              </div>
            </div>

            {/* 4. Email Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Address <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError('');
                  }}
                  placeholder="e.g. student@umu.ac.in or you@gmail.com"
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
                />
                <Mail size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
              </div>
            </div>

            {/* 5. Create Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Password <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters with letters & numbers"
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-10 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
                />
                <Lock size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Password strength:</span>
                    <span
                      className={`font-bold ${
                        passwordStrength.score >= 3
                          ? 'text-emerald-700'
                          : passwordStrength.score === 2
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    <div className={`rounded-full ${passwordStrength.score >= 1 ? passwordStrength.color : 'bg-slate-200'} transition-all`} />
                    <div className={`rounded-full ${passwordStrength.score >= 2 ? passwordStrength.color : 'bg-slate-200'} transition-all`} />
                    <div className={`rounded-full ${passwordStrength.score >= 3 ? passwordStrength.color : 'bg-slate-200'} transition-all`} />
                    <div className={`rounded-full ${passwordStrength.score >= 4 ? passwordStrength.color : 'bg-slate-200'} transition-all`} />
                  </div>
                </div>
              )}
            </div>

            {/* 6. Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirm Password <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className={`w-full rounded-xl border pl-10 pr-10 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 transition-all outline-none ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-emerald-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                        : 'border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
                      : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-100'
                  }`}
                />
                <Lock size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Match Status */}
              {confirmPassword.length > 0 && (
                <p
                  className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${
                    passwordsMatch ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {passwordsMatch ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span>Passwords match</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} className="text-rose-600" />
                      <span>Passwords do not match</span>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Referral Attribution Note */}
            {referralCode && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                <Sparkles size={14} className="text-purple-600 shrink-0" />
                <span>
                  Invited via Referral Code: <strong className="font-mono font-bold">{referralCode}</strong>
                </span>
              </div>
            )}

            {/* Form Error Banner */}
            {formError && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2"
              >
                <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{formError}</span>
              </div>
            )}

            {/* Feedback Banner */}
            {feedback && (
              <div
                role="alert"
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  feedback.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : feedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-purple-50 border-purple-200 text-purple-800'
                }`}
              >
                {feedback.type === 'error' ? (
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{feedback.text}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2.5 text-sm sm:text-base transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <RefreshCw size={18} className="animate-spin text-purple-200" />
                  <span>Registering Account…</span>
                </>
              ) : (
                <>
                  <span>Create Student Account</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: 6-Digit Email Verification Section */}
        {otpSent && (
          <div className="space-y-5">
            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-purple-950">
                  <ShieldCheck size={16} className="text-purple-600" />
                  <span>Email Verification Code</span>
                </div>
                {expiryRemaining > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-mono text-purple-700 font-bold bg-white px-2.5 py-1 rounded-lg border border-purple-200 shadow-2xs">
                    <Clock size={12} className="text-purple-600" />
                    <span>Expires in {formatTimer(expiryRemaining)}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-purple-900 leading-relaxed font-medium">
                Please enter the 6-digit confirmation code delivered to <strong className="font-bold text-purple-950">{email}</strong>:
              </p>

              {/* 6 Individual OTP Boxes */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 py-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-black rounded-xl border border-purple-300 bg-white text-purple-950 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition-all outline-none shadow-sm"
                  />
                ))}
              </div>

              {/* OTP Error Notice */}
              {otpError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl font-medium">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>{otpError}</span>
                </div>
              )}

              {/* Verification & Resend Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={verifyingOtp || otpDigits.join('').length !== 6}
                  className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-sm px-6 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {verifyingOtp ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Verifying…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Verify & Activate Account</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Didn't receive it?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={cooldownRemaining > 0 || resendingOtp}
                    className="font-bold text-purple-700 hover:text-purple-900 hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
                  >
                    {resendingOtp ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                    <span>{cooldownRemaining > 0 ? `Resend in ${cooldownRemaining}s` : 'Resend Code'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpError('');
                }}
                className="text-xs text-slate-500 hover:text-purple-700 underline"
              >
                &larr; Change email address
              </button>
            </div>
          </div>
        )}

        {/* Card Footer: Navigation to Login */}
        <div className="border-t border-slate-100 pt-4 text-center">
          <p className="text-xs sm:text-sm text-slate-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onNavigateLogin}
              className="font-bold text-purple-700 hover:text-purple-900 hover:underline transition-colors ml-1"
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
