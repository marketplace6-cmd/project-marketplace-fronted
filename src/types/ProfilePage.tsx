import React, { useState } from 'react';
import {
  User,
  GraduationCap,
  BookOpen,
  Mail,
  Phone,
  ShieldCheck,
  AlertCircle,
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
  Lock
} from 'lucide-react';
import { StudentProfile } from './types';
import { supabase } from '../supabaseClient';

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

  /**
   * Re-sync student profile live from Supabase strictly for this isolated user
   */
  const handleLiveRefresh = async () => {
    if (!student.email && !student.id) return;
    setRefreshing(true);

    try {
      const cleanEmail = (student.email || '').toLowerCase().trim();
      const { data: rows, error } = await supabase
        .from('verifications')
        .select('*')
        .or(`email.ilike.${cleanEmail},email.eq.${cleanEmail},student_id_code.eq.${student.id}`)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      if (rows && rows.length > 0) {
        const v = rows[0];
        const isVerified = v.status === 'APPROVED' || v.status === 'VERIFIED';
        const rejCount = Number(v.rejection_count || 0);

        const updated: Partial<StudentProfile> = {
          fullName: v.student_name || student.fullName,
          collegeName: v.college || student.collegeName,
          department: v.course || student.department,
          mobile: v.phone || student.mobile,
          referralCode: v.referral_code || v.student_id_code || student.referralCode,
          authState: isVerified
            ? 'verified'
            : v.status === 'BLOCKED' || rejCount >= 2
            ? 'verification_blocked'
            : v.status === 'REJECTED'
            ? 'verification_rejected'
            : v.status === 'RE-UPLOADED'
            ? 'verification_pending'
            : v.status === 'PENDING'
            ? 'verification_pending'
            : 'verification_pending',
          rejectionCount: rejCount,
          rejectionReason: v.rejection_reason || undefined
        };

        if (onUpdateProfile) {
          onUpdateProfile(updated);
        }
        displayToast('Profile details updated from live server!', 'success');
      } else {
        displayToast('Profile is up to date.', 'info');
      }
    } catch (err: any) {
      console.warn('Profile refresh error:', err);
      displayToast('Profile refreshed from local state.', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const rejectionRemaining = 2 - Math.min(2, student.rejectionCount || 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* 1. Profile Hero Header */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        {/* Subtle decorative glow */}
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
                  Verification Pending • Under Admin Review
                </span>
              ) : student.authState === 'verification_rejected' ? (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-400/25 border border-rose-300/40 text-rose-100 flex items-center gap-1">
                  <AlertCircle size={12} className="text-rose-300" />
                  Action Required
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-purple-200">
                  Unverified
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
          {onNavigateVerification && (
            <button
              type="button"
              onClick={onNavigateVerification}
              className="px-4 py-2.5 rounded-xl bg-white text-purple-900 hover:bg-purple-50 text-xs font-extrabold shadow-md transition-all active:scale-[0.98] flex items-center gap-1.5"
            >
              <FileText size={14} className="text-purple-700" />
              <span>Verification Status</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Verification Pending Banner */}
      {student.authState === 'verification_pending' && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 text-xs text-amber-950 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <Clock size={20} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <h4 className="font-bold text-sm text-amber-900">Verification Pending • Under Admin Review</h4>
              <p className="mt-1 text-amber-800 leading-relaxed">
                Your submitted student ID card documents (Front & Back) have been securely received and are currently queued for administrator review. Full student privileges, verified downloads, and 5 free PPT slide previews will unlock immediately once approved.
              </p>
            </div>
          </div>
          {onNavigateVerification && (
            <button
              type="button"
              onClick={onNavigateVerification}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shrink-0 transition-colors shadow-2xs whitespace-nowrap"
            >
              Check Status
            </button>
          )}
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
          {onNavigateVerification && (
            <button
              type="button"
              onClick={onNavigateVerification}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shrink-0 transition-colors"
            >
              Re-Upload ID
            </button>
          )}
        </div>
      )}

      {/* 3. Core Cards Grid */}
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
              <span>View Referral Network & Earnings</span>
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
                Verification Pending • Under Admin Review
              </span>
            ) : student.authState === 'verification_rejected' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full">
                <AlertCircle size={12} className="text-rose-600" />
                Action Required
              </span>
            ) : (
              <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                Unverified
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

          {onNavigateVerification && (
            <button
              type="button"
              onClick={onNavigateVerification}
              className="w-full text-center text-xs font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center justify-center gap-1 pt-1"
            >
              <span>{student.authState === 'verified' ? 'View ID Card Record' : 'Upload College ID Card'}</span>
              <ExternalLink size={13} />
            </button>
          )}
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
                <span>5 PPT Preview Credits (Locked)</span>
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

      {/* 4. Academic Details & Credentials Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4">
        <h3 className="font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <GraduationCap size={18} className="text-indigo-600" />
          <span>Academic & Personal Credentials</span>
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
                <span className="text-amber-700">Verification Pending</span>
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

