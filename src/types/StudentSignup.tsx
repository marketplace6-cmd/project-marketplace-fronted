import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  GraduationCap,
  BookOpen,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Send,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldCheck,
  Check
} from 'lucide-react';
import {
  StudentRegistrationService,
  validateContact,
  evaluatePasswordStrength
} from './studentRegistrationService';
import { StudentProfile } from './types';
import { supabase } from '../supabaseClient';
import { INITIAL_STUDENT } from './mockData';

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
  // Form input states
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('B.Tech - Computer Science & Engineering');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP System states
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isContactVerified, setIsContactVerified] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [formError, setFormError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);

  // Timers: Cooldown (60s) & Expiry (300s = 5m)
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [expiryRemaining, setExpiryRemaining] = useState(0);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Refs for 6 OTP input boxes
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ text: msg, type });
    if (showToast) {
      showToast(msg, type);
    }
  };

  // Cooldown timer interval
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  // Expiry timer interval
  useEffect(() => {
    if (expiryRemaining <= 0) return;
    const interval = setInterval(() => {
      setExpiryRemaining((prev) => {
        if (prev <= 1) {
          displayToast('Your OTP code has expired. Please click "Send OTP" to request a new one.', 'error');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryRemaining]);

  // Format seconds to MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const contactValidation = validateContact(contact);
  const passwordStrength = evaluatePasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  /**
   * Handle "Send OTP" Action
   */
  const handleSendOtp = async () => {
    if (!contactValidation.valid) {
      displayToast(contactValidation.error || 'Please enter a valid email or 10-digit mobile number.', 'error');
      return;
    }

    setSendingOtp(true);
    setFeedback(null);

    try {
      const res = await StudentRegistrationService.sendOtp(contact);
      setOtpSent(true);
      setCooldownRemaining(res.cooldownSeconds || 60);
      setExpiryRemaining(300); // 5 minutes
      setOtpDigits(['', '', '', '', '', '']);

      displayToast(res.message, 'success');

      // Auto-focus first OTP box
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      displayToast(err?.message || 'Failed to send OTP. Please try again.', 'error');
    } finally {
      setSendingOtp(false);
    }
  };

  /**
   * Handle OTP Box Digit Change & Auto-Advance
   */
  const handleOtpDigitChange = (index: number, value: string) => {
    // Only accept numeric digits
    const cleaned = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (!cleaned) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    // Single digit input
    newDigits[index] = cleaned.charAt(cleaned.length - 1);
    setOtpDigits(newDigits);

    // Auto-advance to next box if available
    if (index < 5 && cleaned) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  /**
   * Handle Backspace Navigation between OTP Boxes
   */
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  /**
   * Handle Paste of full 6-digit OTP code
   */
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);

    // Focus last filled box
    const nextIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[nextIdx]?.focus();
  };

  /**
   * Handle "Verify OTP" Action against Supabase Auth (type: 'email')
   */
  const handleVerifyOtp = async () => {
    setOtpError('');
    setFeedback(null);
    const otpCode = otpDigits.join('');
    if (otpCode.length !== 6) {
      setOtpError('Please enter all 6 digits of the OTP code.');
      displayToast('Please enter all 6 digits of the OTP code.', 'error');
      return;
    }

    setVerifyingOtp(true);

    try {
      const email = contact.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(), // 6-digit string joined from the OTP inputs
        type: 'email',
      });

      if (error) {
        console.warn('Supabase verifyOtp error:', error.message);
        setOtpError('Invalid or expired OTP code.');
        displayToast('Invalid or expired OTP code.', 'error');
        return;
      }

      setIsOtpVerified(true);
      setIsContactVerified(true);
      displayToast('Contact verified successfully! You may now create your account.', 'success');
    } catch (err: any) {
      setOtpError('Invalid or expired OTP code.');
      displayToast(err?.message || 'Invalid or expired OTP code.', 'error');
    } finally {
      setVerifyingOtp(false);
    }
  };

  /**
   * Handle "Create Account" Submission
   * Uses supabase.auth.updateUser({ password }) to save the user password
   * and inserts their student profile row using the authenticated session.
   */
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFeedback(null);

    if (!isOtpVerified && !isContactVerified) {
      setFormError('Please verify your email address with OTP first.');
      displayToast('Please verify your email address with OTP first.', 'error');
      return;
    }

    if (!passwordsMatch) {
      setFormError('Passwords do not match. Please re-enter your confirm password.');
      displayToast('Passwords do not match. Please re-enter your confirm password.', 'error');
      return;
    }
    if (passwordStrength.score < 2) {
      setFormError('Please choose a stronger password before continuing.');
      displayToast('Please choose a stronger password before continuing.', 'error');
      return;
    }

    setSubmittingAccount(true);

    try {
      // 1. Save the user's password using updateUser on the authenticated session
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });

      if (passwordError) {
        setFormError(passwordError.message);
        displayToast(passwordError.message, 'error');
        setSubmittingAccount(false);
        return;
      }

      // 2. Insert student profile row using the authenticated user session
      const cleanEmail = contact.trim().toLowerCase();
      const isEmail = cleanEmail.includes('@');
      const emailVal = isEmail ? cleanEmail : `${fullName.toLowerCase().replace(/\s+/g, '')}@student.umu.ac.in`;
      const phoneVal = !isEmail ? cleanEmail.replace(/\D/g, '') : '7004273758';
      const randomNumericId = Math.floor(1000 + Math.random() * 9000);
      const studentIdCode = `STU-2026-${randomNumericId}`;
      const personalReferralCode = `AK${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Insert student profile row into public.verifications
      const verificationRecord = {
        user_id: randomNumericId,
        student_id_code: studentIdCode,
        student_name: fullName.trim(),
        email: emailVal,
        phone: phoneVal,
        college: college.trim(),
        course: course.trim(),
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

      // Record referral attribution if registered via referral code
      if (referralCode) {
        try {
          await supabase.from('referrals').insert([{
            referral_code: referralCode.trim(),
            referred_student_id: studentIdCode,
            referred_student_name: fullName.trim(),
            level: 1,
            status: 'PENDING',
            commission_amount: 150,
            created_at: new Date().toISOString()
          }]);
        } catch {
          /* ignore */
        }
      }

      // Get authenticated session token
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token || `uvikart_token_${randomNumericId}_${Date.now()}`;

      const studentProfile: StudentProfile = {
        ...INITIAL_STUDENT,
        id: studentIdCode,
        fullName: fullName.trim(),
        collegeName: college.trim(),
        department: course.trim(),
        email: emailVal,
        mobile: phoneVal,
        referralCode: personalReferralCode,
        accessToken: token,
        authState: 'verification_pending',
        role: 'student'
      };

      displayToast(`Account created successfully! Welcome to Uvikart, ${fullName.trim()}.`, 'success');

      if (onSuccess) {
        onSuccess({ studentProfile });
      } else if (onNavigateDashboard) {
        onNavigateDashboard();
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Registration failed. Please check your details and try again.';
      setFormError(errMsg);
      displayToast(errMsg, 'error');
    } finally {
      setSubmittingAccount(false);
    }
  };

  // Determine if form is completely valid to unlock Create Account button
  const isFormValid =
    fullName.trim().length >= 2 &&
    college.trim().length >= 2 &&
    Boolean(course) &&
    (isOtpVerified || isContactVerified) &&
    password.length >= 6 &&
    passwordsMatch;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-indigo-50/70 via-purple-50/40 to-white py-12 px-4 sm:px-6 relative overflow-hidden flex items-center justify-center">
      {/* Decorative Purple Wave Background Elements */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-purple-200/40 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />

      {/* Decorative SVG Waves */}
      <svg
        className="absolute top-0 left-0 w-full h-40 opacity-30 pointer-events-none text-purple-300"
        fill="currentColor"
        viewBox="0 0 1440 320"
      >
        <path d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,128C672,128,768,160,864,176C960,192,1056,192,1152,176C1248,160,1344,128,1392,112L1440,96L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z" />
      </svg>

      {/* Centered White Signup Card */}
      <div className="w-full max-w-xl mx-auto bg-white rounded-3xl border border-purple-100 shadow-xl shadow-purple-900/5 p-6 sm:p-10 relative z-10 space-y-6">
        {/* Card Header */}
        <div className="text-center sm:text-left space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
            <Sparkles size={13} className="text-purple-600" />
            <span>VERIFIED STUDENT REGISTRATION</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Create Student Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Create your student profile, set a password, verify your contact with OTP, and start exploring projects.
          </p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleCreateAccount} className="space-y-4">
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
                placeholder="e.g. Mayank Kumar"
                className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
              />
              <User size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
            </div>
          </div>

          {/* 2. College / University */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              College / University <span className="text-purple-600">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                minLength={2}
                maxLength={150}
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                placeholder="e.g. Usha Martin University"
                className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none"
              />
              <GraduationCap size={17} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
            </div>
          </div>

          {/* 3. Course / Department Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Course / Department <span className="text-purple-600">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full rounded-xl border border-slate-300 pl-10 pr-8 py-2.5 text-sm font-normal text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none bg-white appearance-none cursor-pointer"
              >
                {COURSE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <BookOpen size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
              <div className="absolute right-3.5 top-3.5 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* 4. Email Address or Phone Number with Send OTP Button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Email Address or Phone Number <span className="text-purple-600">*</span>
              </label>
              {isContactVerified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Verified
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                    if (isContactVerified) setIsContactVerified(false);
                    if (isOtpVerified) setIsOtpVerified(false);
                    if (otpSent) setOtpSent(false);
                    setOtpError('');
                    setFormError('');
                  }}
                  disabled={isContactVerified || sendingOtp}
                  placeholder="student@umu.ac.in or +91 98765 43210"
                  className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-500"
                />
                {contact.includes('@') ? (
                  <Mail size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
                ) : (
                  <Phone size={16} className="absolute left-3.5 top-3 text-purple-500 pointer-events-none" />
                )}
              </div>

              {!isContactVerified && (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={!contactValidation.valid || sendingOtp || cooldownRemaining > 0}
                  className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {sendingOtp ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  <span>
                    {cooldownRemaining > 0
                      ? `Resend (${cooldownRemaining}s)`
                      : otpSent
                      ? 'Resend OTP'
                      : 'Send OTP'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 5. 6-Digit OTP Verification Section */}
          {otpSent && !isContactVerified && (
            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-purple-950">
                  <ShieldCheck size={16} className="text-purple-600" />
                  <span>One-time code (OTP)</span>
                </div>
                {expiryRemaining > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-mono text-purple-700 font-bold bg-white px-2 py-0.5 rounded-md border border-purple-200">
                    <Clock size={12} className="text-purple-600" />
                    <span>Expires in {formatTimer(expiryRemaining)}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-purple-900 leading-relaxed font-medium">
                Enter the 6-digit numeric verification code dispatched to <strong className="font-bold">{contact}</strong>:
              </p>

              {/* 6 Individual OTP Boxes */}
              <div className="flex items-center justify-between gap-2 max-w-sm mx-auto sm:mx-0">
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
                    className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all outline-none shadow-xs"
                  />
                ))}
              </div>

              {/* OTP Error Notice */}
              {otpError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl font-medium">
                  <AlertCircle size={14} className="shrink-0 text-rose-600" />
                  <span>{otpError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={verifyingOtp || otpDigits.join('').length !== 6}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {verifyingOtp ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  <span>Verify OTP</span>
                </button>

                {cooldownRemaining === 0 && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-xs font-bold text-purple-700 hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 6. Create Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Create Password <span className="text-purple-600">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters with letters & numbers"
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
                  <span className={`font-bold ${
                    passwordStrength.score >= 3 ? 'text-emerald-700' : passwordStrength.score === 2 ? 'text-amber-700' : 'text-rose-700'
                  }`}>
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

          {/* 7. Confirm Password */}
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
              <p className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${
                passwordsMatch ? 'text-emerald-700' : 'text-rose-600'
              }`}>
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

          {/* 8. Create Account Button */}
          <button
            type="submit"
            disabled={!isFormValid || submittingAccount}
            className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2.5 text-sm sm:text-base transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {submittingAccount ? (
              <>
                <RefreshCw size={18} className="animate-spin text-purple-200" />
                <span>Creating your student account…</span>
              </>
            ) : (
              <>
                <UserPlus size={18} />
                <span>Create Account</span>
              </>
            )}
          </button>

          {!isContactVerified && (
            <p className="text-[11px] text-slate-400 text-center font-medium">
              * Contact must be verified with 6-digit OTP to unlock account creation.
            </p>
          )}

          {/* Footer Navigation */}
          <div className="pt-2 text-center text-xs text-slate-500">
            Already registered?{' '}
            <button
              type="button"
              onClick={onNavigateLogin}
              className="font-bold text-purple-700 hover:text-purple-800 hover:underline"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

