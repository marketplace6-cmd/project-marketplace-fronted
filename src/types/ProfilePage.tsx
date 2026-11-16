import React, { useState, useEffect } from 'react';
import {
  User,
  GraduationCap,
  BookOpen,
  Mail,
  Phone,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Heart,
  Share2,
  FileText,
  Clock,
  Sparkles,
  CheckCircle2,
  Lock,
  Upload
} from 'lucide-react';
import { StudentProfile } from './types';
import { supabase } from '../supabaseClient';
import { StudentVerificationAPI } from './verificationService';

export interface ProfilePageProps {
  student: StudentProfile;
  onUpdateProfile?: (updated: Partial<StudentProfile>) => void;
  onNavigateVerification?: () => void;
  onNavigateReferrals?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ProfilePage({
  student,
  onUpdateProfile,
  onNavigateVerification,
  onNavigateReferrals,
  showToast
}: ProfilePageProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ID Card Upload States
  const [idCardFrontFile, setIdCardFrontFile] = useState<File | null>(null);
  const [idCardBackFile, setIdCardBackFile] = useState<File | null>(null);
  const [idCardFrontPreview, setIdCardFrontPreview] = useState<string>('');
  const [idCardBackPreview, setIdCardBackPreview] = useState<string>('');
  const [idCardSubmitting, setIdCardSubmitting] = useState<boolean>(false);

  const displayToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (showToast) showToast(msg, type);
  };

  const handleCopyReferralCode = () => {
    const code = student.referralCode || student.id;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      displayToast(`Referral Code ${code} copied to clipboard!`, 'success');
    }
  };

  const isValidIdCardFormat = (file: File) => {
    const validMimes = ['image/png', 'image/jpeg', 'image/jpg'];
    const validExts = /\.(png|jpe?g)$/i;
    return validMimes.includes(file.type.toLowerCase()) || validExts.test(file.name);
  };

  const handleFrontIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidIdCardFormat(file) || file.size > 50 * 1024) {
      e.target.value = '';
      setIdCardFrontFile(null);
      setIdCardFrontPreview('');
      displayToast('Front file size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }

    setIdCardFrontFile(file);
    const reader = new FileReader();
    reader.onload = () => setIdCardFrontPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBackIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidIdCardFormat(file) || file.size > 50 * 1024) {
      e.target.value = '';
      setIdCardBackFile(null);
      setIdCardBackPreview('');
      displayToast('Back file size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }

    setIdCardBackFile(file);
    const reader = new FileReader();
    reader.onload = () => setIdCardBackPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitVerification = async () => {
    if (student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2) {
      displayToast('Account is permanently restricted from further verification submissions.', 'error');
      return;
    }
    if (!idCardFrontFile) {
      displayToast('Please choose at least the Front side of your College ID Card.', 'error');
      return;
    }
    if (!isValidIdCardFormat(idCardFrontFile) || idCardFrontFile.size > 50 * 1024) {
      displayToast('Front file size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }
    if (idCardBackFile && (!isValidIdCardFormat(idCardBackFile) || idCardBackFile.size > 50 * 1024)) {
      displayToast('Back file size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }

    setIdCardSubmitting(true);
    try {
      const frontDataUrl = idCardFrontPreview || await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(idCardFrontFile);
      });

      let backDataUrl = '';
      if (idCardBackFile) {
        backDataUrl = idCardBackPreview || await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(idCardBackFile);
        });
      }

      let targetEmail = student.email?.trim() || '';
      if (!targetEmail) {
        const { data: sessionData } = await supabase.auth.getSession();
        targetEmail = sessionData?.session?.user?.email?.trim() || '';
      }

      if (!targetEmail) {
        displayToast('Please sign in or enter your registered student email before submitting.', 'error');
        setIdCardSubmitting(false);
        return;
      }

      const targetName = student.fullName?.trim() || targetEmail.split('@')[0] || 'Student';
      const targetCollege = student.collegeName?.trim() || 'University Student';
      const targetCourse = student.department?.trim() || 'Degree Program';
      const targetId = (student.id && student.id !== 'STU-000-000') ? student.id : `STU-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const targetReferralCode = student.referralCode || targetId;
      const targetPhone = student.mobile?.trim() || '';

      const formData = new FormData();
      formData.append('front_image', idCardFrontFile);
      if (idCardBackFile) formData.append('back_image', idCardBackFile);
      formData.append('student_name', targetName);
      formData.append('email', targetEmail);
      formData.append('phone', targetPhone);
      formData.append('college', targetCollege);
      formData.append('course', targetCourse);
      formData.append('student_id_code', targetId);
      formData.append('referral_code', targetReferralCode);
      formData.append('user_id', targetId);

      const isReupload = student.authState === 'verification_rejected' || (student.rejectionCount || 0) > 0;

      await StudentVerificationAPI.submitDual(formData, {
        student_name: targetName,
        email: targetEmail,
        phone: targetPhone,
        college: targetCollege,
        course: targetCourse,
        student_id_code: targetId,
        referral_code: targetReferralCode,
        front_data_url: frontDataUrl,
        back_data_url: backDataUrl,
        front_filename: idCardFrontFile.name,
        back_filename: idCardBackFile ? idCardBackFile.name : undefined,
        user_id: targetId,
        is_reupload: isReupload
      });

      if (onUpdateProfile) {
        onUpdateProfile({
          authState: 'verification_pending',
          rejectionReason: undefined
        });
      }

      displayToast(
        isReupload
          ? 'Corrected ID documents re-submitted! Prioritized in admin verification queue.'
          : 'ID documents (Front & Back) submitted successfully! Admin review pending.',
        'success'
      );

      // Trigger server re-sync
      void handleLiveRefresh();
    } catch (err: any) {
      displayToast(err?.message || 'Failed to submit verification to database.', 'error');
    } finally {
      setIdCardSubmitting(false);
    }
  };

  /**
   * Re-sync student profile live from Supabase strictly for this isolated user
   */
  const handleLiveRefresh = async () => {
    setRefreshing(true);

    try {
      let targetEmail = (student.email || '').toLowerCase().trim();
      let targetId = (student.id || '').trim();

      if (!targetEmail) {
        const { data: sessionData } = await supabase.auth.getSession();
        targetEmail = sessionData?.session?.user?.email?.toLowerCase().trim() || '';
      }

      const orFilters: string[] = [];
      if (targetEmail) {
        orFilters.push(`email.ilike.${targetEmail}`, `email.eq.${targetEmail}`);
      }
      if (targetId && targetId !== 'STU-000-000') {
        orFilters.push(`student_id_code.eq.${targetId}`, `user_id.eq.${targetId}`);
      }

      if (orFilters.length === 0) {
        setRefreshing(false);
        return;
      }

      const { data: rows, error } = await supabase
        .from('verifications')
        .select('*')
        .or(orFilters.join(','))
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      if (rows && rows.length > 0) {
        const v = rows[0];
        const isVerified = v.status === 'APPROVED' || v.status === 'VERIFIED';
        const isPending = v.status === 'PENDING' || v.status === 'RE-UPLOADED';
        const isRejected = v.status === 'REJECTED';
        const rejCount = Number(v.rejection_count || 0);
        const isBlocked = v.status === 'BLOCKED' || rejCount >= 2;

        const updated: Partial<StudentProfile> = {
          fullName: v.student_name || student.fullName,
          collegeName: v.college || student.collegeName,
          department: v.course || student.department,
          mobile: v.phone || student.mobile,
          referralCode: v.referral_code || v.student_id_code || student.referralCode,
          authState: isVerified
            ? 'verified'
            : isBlocked
            ? 'verification_blocked'
            : isRejected
            ? 'verification_rejected'
            : isPending
            ? 'verification_pending'
            : 'logged_in',
          rejectionCount: rejCount,
          rejectionReason: v.rejection_reason || undefined
        };

        if (onUpdateProfile) {
          onUpdateProfile(updated);
        }
        displayToast('Profile details updated from live server!', 'success');
      } else {
        // Not yet submitted in database
        if (onUpdateProfile) {
          onUpdateProfile({
            authState: 'logged_in',
            rejectionCount: 0,
            rejectionReason: undefined
          });
        }
      }
    } catch (err: any) {
      console.warn('Profile refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void handleLiveRefresh();

    const handleUpdate = () => {
      void handleLiveRefresh();
    };
    window.addEventListener('unikart:verification_updated', handleUpdate);
    return () => {
      window.removeEventListener('unikart:verification_updated', handleUpdate);
    };
  }, [student.id, student.email]);

  const rejectionRemaining = 2 - Math.min(2, student.rejectionCount || 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* 1. Profile Hero Header */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 sm:gap-5 z-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/15 border border-white/20 backdrop-blur-md flex items-center justify-center font-black text-2xl sm:text-3xl text-white shadow-inner shrink-0">
            {student.fullName ? student.fullName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[11px] font-extrabold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25">
                Isolated Student Account
              </span>
              {student.authState === 'verified' ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/25 border border-emerald-300/40 text-emerald-100 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-300" />
                  Verified Student
                </span>
              ) : student.authState === 'verification_pending' ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-100 flex items-center gap-1 shadow-2xs">
                  <Clock size={12} className="text-amber-300 animate-spin" />
                  Pending Verification
                </span>
              ) : student.authState === 'verification_rejected' ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-400/25 border border-rose-300/40 text-rose-100 flex items-center gap-1">
                  <AlertCircle size={12} className="text-rose-300" />
                  Action Required
                </span>
              ) : student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2 ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-400/25 border border-rose-300/40 text-rose-100 flex items-center gap-1">
                  <AlertCircle size={12} className="text-rose-300" />
                  Account Restricted
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-100 flex items-center gap-1">
                  <AlertCircle size={12} className="text-amber-300" />
                  Not Verified
                </span>
              )}
              <span className="text-xs text-purple-200">
                • {student.email}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{student.fullName || 'Student User'}</h1>
            <p className="text-xs sm:text-sm text-purple-100 mt-0.5 flex items-center gap-2">
              <span>{student.collegeName || 'Verified University'}</span>
              <span>•</span>
              <span className="font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md text-xs">{student.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 z-10 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleLiveRefresh}
            disabled={refreshing}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all flex items-center gap-1.5 backdrop-blur-xs active:scale-[0.98]"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing…' : 'Sync Profile'}</span>
          </button>
        </div>
      </div>

      {/* 2. Verification Pending Banner */}
      {student.authState === 'verification_pending' && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 text-xs text-amber-950 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <Clock size={20} className="text-amber-600 shrink-0 mt-0.5 animate-spin" />
            <div>
              <h4 className="font-bold text-sm text-amber-900">Verification Pending • Under Admin Review</h4>
              <p className="mt-1 text-amber-800 leading-relaxed">
                Your submitted student ID card documents have been securely received and are queued for administrator review. Full student privileges, evaluated downloads, and 5 free PPT slide previews will unlock immediately once approved.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">
            <Clock size={12} className="text-amber-700 animate-spin" /> Pending Verification
          </span>
        </div>
      )}

      {/* 3. Rejection Banner if verification rejected */}
      {student.authState === 'verification_rejected' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 text-xs text-rose-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-rose-950">ID Verification Notice</h4>
              <p className="mt-1 leading-relaxed">
                {student.rejectionReason
                  ? `Reason: "${student.rejectionReason}". `
                  : 'Your submitted student ID card could not be verified. '}
                You have <strong className="font-bold">{rejectionRemaining} re-upload attempt{rejectionRemaining !== 1 ? 's' : ''} remaining</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Core Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Unique Student ID & Permanent Referral Code */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-700 font-extrabold text-xs uppercase tracking-wide">
              <Sparkles size={16} />
              <span>Permanent Referral Code</span>
            </div>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
              Permanent
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Your unique Student ID is assigned as your permanent referral code for multi-tier affiliate rewards.
          </p>

          <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center justify-between">
            <span className="font-mono font-black text-xl text-purple-950 tracking-wider">
              {student.referralCode || student.id}
            </span>
            <button
              type="button"
              onClick={handleCopyReferralCode}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
            >
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedCode ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {onNavigateReferrals && (
            <button
              type="button"
              onClick={onNavigateReferrals}
              className="w-full text-center text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline flex items-center justify-center gap-1 pt-1"
            >
              <span>View Referral Network &amp; Earnings</span>
              <ExternalLink size={13} />
            </button>
          )}
        </div>

        {/* Card 2: Academic Verification Status */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs uppercase tracking-wide">
              <ShieldCheck size={16} />
              <span>Identity Verification</span>
            </div>
            {student.authState === 'verified' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 size={12} className="text-emerald-600" />
                Verified Student
              </span>
            ) : student.authState === 'verification_pending' ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 px-3 py-1 rounded-full shadow-2xs">
                <Clock size={12} className="text-amber-600 animate-spin" />
                Pending Verification
              </span>
            ) : student.authState === 'verification_rejected' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full">
                <AlertCircle size={12} className="text-rose-600" />
                Action Required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                <AlertCircle size={12} className="text-amber-600" />
                Not Verified
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600">
            {student.authState === 'verified'
              ? 'Your student identity is verified. You have full access to evaluated capstone downloads and verified pricing.'
              : 'Submit front and back photos of your college ID card to unlock full student marketplace benefits.'}
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-xs">
            <div className="text-slate-500 text-[11px]">Lifecycle Record:</div>
            <div className="font-semibold text-slate-800">
              {student.authState === 'verified'
                ? 'Official College Verification Complete'
                : student.authState === 'verification_pending'
                ? 'Document in Verification Queue'
                : student.authState === 'verification_rejected'
                ? 'Re-upload Requested'
                : 'Registration Initialized'}
            </div>
          </div>
        </div>

        {/* Card 3: Free PPT Preview Heart Credits */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-600 font-extrabold text-xs uppercase tracking-wide">
              <Heart size={16} className="fill-rose-500 text-rose-500" />
              <span>PPT Preview Credits</span>
            </div>
            <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
              90-Day Reset
            </span>
          </div>

          <p className="text-xs text-slate-600">
            {student.authState === 'verified'
              ? 'Every verified student receives 5 complimentary PPT slide evaluations to review projects before purchase.'
              : 'Complete your student verification to unlock 5 complimentary PPT slide evaluations.'}
          </p>

          {student.authState === 'verified' ? (
            <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {[...Array(5)].map((_, i) => (
                  <Heart
                    key={i}
                    size={18}
                    className={
                      i < (student.previewStats?.remainingPreviews ?? 5)
                        ? 'fill-rose-500 text-rose-500 animate-pulse'
                        : 'text-slate-300 fill-slate-200'
                    }
                  />
                ))}
              </div>
              <span className="font-extrabold text-sm text-rose-950">
                {student.previewStats?.remainingPreviews ?? 5} / 5 Available
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600 text-xs font-medium">
                <Lock size={15} className="text-amber-600" />
                <span>0 / 5 Previews (Locked)</span>
              </div>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Unlocked on Approval
              </span>
            </div>
          )}

          <div className="text-[11px] text-slate-500 pt-1 text-center">
            {student.authState === 'verified'
              ? 'Isolated server-tracked credits per student account.'
              : 'Awaiting admin verification to activate.'}
          </div>
        </div>
      </div>

      {/* 5. Complete Your Student ID Verification Form (Embedded) */}
      {student.authState !== 'verified' && student.authState !== 'verification_blocked' && (student.rejectionCount || 0) < 2 && (
        <div id="student-verification-upload-section" className="bg-amber-50/80 border border-amber-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg font-bold text-amber-900">
                {student.authState === 'verification_rejected' ? 'Re-upload Your Student ID Card' : 'Complete Your Student Verification'}
              </h3>
            </div>
            {student.authState === 'verification_pending' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Clock size={13} className="text-amber-700 animate-spin" />
                Pending Verification
              </span>
            )}
          </div>
          <p className="text-xs text-amber-800">
            Please upload clear photos of the front and back of your valid college/university ID card. Strictly PNG or JPG format (maximum 50 KB each). Without verification, PPT previews are locked.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Front Side */}
            <div className={`relative rounded-2xl border-2 border-dashed p-4 text-center transition-all ${idCardFrontFile ? 'border-emerald-400 bg-white shadow-xs' : 'border-amber-300 bg-white hover:bg-amber-50/50'}`}>
              {idCardFrontPreview ? (
                <div className="space-y-2">
                  <div className="relative mx-auto h-32 w-full max-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 shadow-inner">
                    <img src={idCardFrontPreview} alt="Front ID Preview" className="h-full w-full object-contain" />
                    <span className="absolute top-2 right-2 rounded-full bg-emerald-600 p-1 text-white shadow-xs">
                      <CheckCircle2 size={13} />
                    </span>
                  </div>
                  <p className="truncate text-xs font-bold text-slate-800">{idCardFrontFile?.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{(idCardFrontFile!.size / 1024).toFixed(0)} KB • ID Card (Front Side)</p>
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer">
                    <Upload size={12} /> Change Front Image
                    <input type="file" accept="image/png, image/jpeg" onChange={handleFrontIdFileChange} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer py-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="block text-xs font-bold text-slate-800 mb-0.5">ID Card (Front Side)</span>
                  <span className="text-[11px] text-slate-500 mb-2">PNG or JPG format (max 50 KB)</span>
                  <span className="px-3 py-1.5 rounded-lg bg-amber-100/70 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors">
                    Choose Front File
                  </span>
                  <input type="file" accept="image/png, image/jpeg" onChange={handleFrontIdFileChange} className="hidden" />
                </label>
              )}
            </div>

            {/* Back Side */}
            <div className={`relative rounded-2xl border-2 border-dashed p-4 text-center transition-all ${idCardBackFile ? 'border-emerald-400 bg-white shadow-xs' : 'border-amber-300 bg-white hover:bg-amber-50/50'}`}>
              {idCardBackPreview ? (
                <div className="space-y-2">
                  <div className="relative mx-auto h-32 w-full max-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 shadow-inner">
                    <img src={idCardBackPreview} alt="Back ID Preview" className="h-full w-full object-contain" />
                    <span className="absolute top-2 right-2 rounded-full bg-emerald-600 p-1 text-white shadow-xs">
                      <CheckCircle2 size={13} />
                    </span>
                  </div>
                  <p className="truncate text-xs font-bold text-slate-800">{idCardBackFile?.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{(idCardBackFile!.size / 1024).toFixed(0)} KB • ID Card (Back Side)</p>
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer">
                    <Upload size={12} /> Change Back Image
                    <input type="file" accept="image/png, image/jpeg" onChange={handleBackIdFileChange} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer py-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <span className="block text-xs font-bold text-slate-800 mb-0.5">ID Card (Back Side)</span>
                  <span className="text-[11px] text-slate-500 mb-2">PNG or JPG format (max 50 KB)</span>
                  <span className="px-3 py-1.5 rounded-lg bg-amber-100/70 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors">
                    Choose Back File
                  </span>
                  <input type="file" accept="image/png, image/jpeg" onChange={handleBackIdFileChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={idCardSubmitting || !idCardFrontFile}
            onClick={handleSubmitVerification}
            className="mt-3 w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-amber-950 text-sm font-bold rounded-2xl transition-all shadow-xs flex items-center justify-center gap-2"
          >
            {idCardSubmitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Submitting Documents to Database...
              </>
            ) : (
              <>
                <ShieldCheck size={16} /> {student.authState === 'verification_rejected' ? 'Resubmit Corrected ID Documents' : 'Submit Documents for Verification'}
              </>
            )}
          </button>
        </div>
      )}

      {/* 6. Academic Details & Credentials Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <GraduationCap size={18} className="text-indigo-600" />
          <span>Academic &amp; Personal Credentials</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Full Name</div>
            <div className="font-bold text-slate-900 text-sm mt-1">{student.fullName || '—'}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">College / University</div>
            <div className="font-bold text-slate-900 text-sm mt-1">{student.collegeName || '—'}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Course / Department</div>
            <div className="font-bold text-slate-900 text-sm mt-1">{student.department || '—'}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Student ID Code</div>
            <div className="font-mono font-bold text-purple-700 text-sm mt-1">{student.id}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Email Address</div>
            <div className="font-bold text-slate-900 text-sm mt-1 truncate">{student.email || '—'}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Mobile Number</div>
            <div className="font-bold text-slate-900 text-sm mt-1">{student.mobile || '—'}</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Account Role</div>
            <div className="font-bold text-sm mt-1 uppercase">
              {student.authState === 'verified' ? (
                <span className="text-emerald-700">Verified Student</span>
              ) : student.authState === 'verification_pending' ? (
                <span className="text-amber-700">Pending Verification</span>
              ) : student.authState === 'verification_rejected' ? (
                <span className="text-rose-700">Re-upload Required</span>
              ) : (
                <span className="text-slate-600">Registered Student</span>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="text-slate-500 font-medium">Data Isolation</div>
            <div className="font-bold text-purple-700 text-sm mt-1">Tenant User Scoped</div>
          </div>
        </div>
      </div>
    </div>
  );
}
