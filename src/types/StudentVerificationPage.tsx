import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import {
  StudentVerificationAPI,
  StudentNotification,
  StudentVerificationStatus,
  VerificationApiError,
  VerificationChallenge
} from './verificationService';

export interface StudentProfileForVerification {
  id?: string;
  fullName?: string;
  email?: string;
  mobile?: string;
  collegeName?: string;
}

interface StudentVerificationPageProps {
  accessToken?: string;
  student?: StudentProfileForVerification;
  onLogin: () => void;
  onContinue: () => void;
  onSessionExpired: () => void;
  onApproved: () => void;
}

function badge(status: StudentVerificationStatus['status']) {
  if (status === 'APPROVED' || status === 'VERIFIED') {
    return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 };
  }
  if (status === 'RE-UPLOADED') {
    return { label: 'Re-uploaded (Priority Review)', className: 'bg-violet-100 text-violet-900 border border-violet-300 font-extrabold', icon: RotateCcw };
  }
  if (status === 'BLOCKED') {
    return { label: 'Account Restricted', className: 'bg-rose-100 text-rose-800', icon: AlertCircle };
  }
  if (status === 'REJECTED') {
    return { label: 'Rejected', className: 'bg-rose-100 text-rose-800', icon: AlertCircle };
  }
  return { label: 'Pending review', className: 'bg-amber-100 text-amber-800', icon: Clock3 };
}

export default function StudentVerificationPage({
  accessToken,
  student,
  onLogin,
  onContinue,
  onSessionExpired,
  onApproved
}: StudentVerificationPageProps) {
  const [verification, setVerification] = useState<StudentVerificationStatus | null>(null);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [studentName, setStudentName] = useState(student?.fullName || '');
  const [studentCollege, setStudentCollege] = useState(student?.collegeName || '');
  const [studentCourse, setStudentCourse] = useState('');
  const [studentEmail, setStudentEmail] = useState(student?.email || '');
  const [paymentPhone, setPaymentPhone] = useState(student?.mobile || '');
  const [puzzleAnswer, setPuzzleAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backFilePreview, setBackFilePreview] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadChallenge = useCallback(async () => {
    if (!accessToken) return;
    try {
      setChallenge(await StudentVerificationAPI.getChallenge(accessToken));
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load the verification challenge.');
      }
    }
  }, [accessToken, onSessionExpired]);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [current, recentNotifications] = await Promise.all([
        StudentVerificationAPI.getMine(accessToken, {
          email: student?.email,
          studentIdCode: student?.studentIdCode || student?.id
        }),
        StudentVerificationAPI.getNotifications(accessToken, student?.studentIdCode || student?.email)
      ]);
      setVerification(current);
      if (current) {
        if (current.student_name && current.student_name !== 'Student') setStudentName(current.student_name);
        if (current.college && current.college !== 'University') setStudentCollege(current.college);
        if (current.course && current.course !== 'Degree') setStudentCourse(current.course);
        if (current.email) setStudentEmail(current.email);
        if (current.phone) setPaymentPhone(current.phone);
      }
      setNotifications(recentNotifications);
      if (!current || current.status === 'REJECTED') await loadChallenge();
      if (
        (current?.status === 'APPROVED' || current?.status === 'VERIFIED') &&
        (!student?.email || current?.email?.toLowerCase() === student?.email.toLowerCase() || current?.student_id_code === student?.id)
      ) {
        onApproved();
      }
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load your verification status.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadChallenge, onApproved, onSessionExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const handleUpdate = () => {
      void refresh();
    };
    window.addEventListener('unikart:verification_updated', handleUpdate);
    window.addEventListener('unikart:new_notification', handleUpdate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('unikart:verification_updated', handleUpdate);
      window.removeEventListener('unikart:new_notification', handleUpdate);
    };
  }, [refresh]);

  const isValidImageFormat = (file: File) => {
    const validMimes = ['image/png', 'image/jpeg', 'image/jpg'];
    const validExts = /\.(png|jpe?g)$/i;
    return validMimes.includes(file.type.toLowerCase()) || validExts.test(file.name);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] || null;
    if (!picked) {
      setFile(null);
      setFilePreview('');
      return;
    }
    if (!isValidImageFormat(picked) || picked.size > 50 * 1024) {
      e.target.value = '';
      setFile(null);
      setFilePreview('');
      setError('File size must be 50 KB or below and in PNG/JPG format.');
      return;
    }
    setError('');
    setFile(picked);
    const url = URL.createObjectURL(picked);
    setFilePreview(url);
  };

  const handleBackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] || null;
    if (!picked) {
      setBackFile(null);
      setBackFilePreview('');
      return;
    }
    if (!isValidImageFormat(picked) || picked.size > 50 * 1024) {
      e.target.value = '';
      setBackFile(null);
      setBackFilePreview('');
      setError('File size must be 50 KB or below and in PNG/JPG format.');
      return;
    }
    setError('');
    setBackFile(picked);
    const url = URL.createObjectURL(picked);
    setBackFilePreview(url);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      onLogin();
      return;
    }
    if (verification?.status === 'BLOCKED' || (verification?.rejection_count || 0) >= 2) {
      setError('Account is restricted from further verification submissions (maximum 2 attempts reached).');
      return;
    }
    if (!file || !challenge) {
      setError('Choose a student ID document and complete the verification challenge.');
      return;
    }
    if (!isValidImageFormat(file) || file.size > 50 * 1024) {
      setError('File size must be 50 KB or below and in PNG/JPG format.');
      return;
    }
    if (backFile && (!isValidImageFormat(backFile) || backFile.size > 50 * 1024)) {
      setError('File size must be 50 KB or below and in PNG/JPG format.');
      return;
    }
    const answer = Number(puzzleAnswer);
    if (!Number.isInteger(answer)) {
      setError('Enter the answer to the arithmetic question.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      // 1. Convert files to data URLs
      const frontDataUrl = filePreview || await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(file);
      });

      let backDataUrl = '';
      if (backFile) {
        backDataUrl = backFilePreview || await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(backFile);
        });
      }

      const effectiveStudentId = student?.id || (studentEmail ? `STU-2026-${studentEmail.slice(0, 4).toUpperCase()}` : 'STU-2026-STU');
      const effectiveReferralCode = student?.referralCode || student?.id || effectiveStudentId;
      const cleanEmail = studentEmail.trim() || student?.email || '';
      const cleanCollege = studentCollege.trim() || student?.collegeName || 'University Student';
      const cleanCourse = studentCourse.trim() || student?.department || 'Degree Program';
      const cleanName = studentName.trim() || student?.fullName || 'Student';

      // 2. Build FormData
      const formData = new FormData();
      formData.append('front_image', file);
      if (backFile) formData.append('back_image', backFile);
      formData.append('student_name', cleanName);
      formData.append('email', cleanEmail);
      formData.append('phone', paymentPhone);
      formData.append('college', cleanCollege);
      formData.append('course', cleanCourse);
      formData.append('user_id', effectiveStudentId);
      formData.append('student_id_code', effectiveStudentId);
      formData.append('referral_code', effectiveReferralCode);

      const isReupload = verification?.status === 'REJECTED' || (verification?.rejection_count || 0) > 0;

      await StudentVerificationAPI.submitDual(formData, {
        student_name: cleanName,
        email: cleanEmail,
        phone: paymentPhone,
        college: cleanCollege,
        course: cleanCourse,
        student_id_code: effectiveStudentId,
        referral_code: effectiveReferralCode,
        front_data_url: frontDataUrl,
        back_data_url: backDataUrl,
        front_filename: file.name,
        back_filename: backFile ? backFile.name : undefined,
        user_id: effectiveStudentId,
        is_reupload: isReupload
      });

      setMessage(
        isReupload
          ? 'Corrected ID documents re-submitted! Prioritized at top of admin review queue.'
          : 'Your ID documents were submitted successfully and are strictly pending admin review.'
      );
      setFile(null);
      setFilePreview('');
      setBackFile(null);
      setBackFilePreview('');
      setPuzzleAnswer('');
      setLoading(false);
      setVerification({
        id: typeof student?.id === 'number' ? student.id : 1,
        status: isReupload ? 'RE-UPLOADED' : 'PENDING',
        payment_phone: paymentPhone,
        rejection_reason: null,
        rejection_count: isReupload ? 1 : 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        document_name: file.name,
        student_name: cleanName,
        college: cleanCollege,
        course: cleanCourse,
        email: cleanEmail,
        phone: paymentPhone,
        front_image_url: frontDataUrl,
        back_image_url: backDataUrl || undefined
      });
    } catch (requestError) {
      if (requestError instanceof VerificationApiError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to submit your document.');
        await loadChallenge();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700"><ShieldCheck size={16} /> Account protection</p>
              <h1 className="mt-2 text-xl font-bold text-slate-900">Student ID Verification</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-600">Submit your current college or university ID card for private review by an administrator.</p>
            </div>
            {verification && (() => {
              const currentBadge = badge(verification.status);
              const Icon = currentBadge.icon;
              return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${currentBadge.className}`}><Icon size={14} />{currentBadge.label}</span>;
            })()}
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {error && !loading && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {!accessToken ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm font-semibold text-amber-900">Sign in to manage your verification</p>
              <p className="mt-1 text-sm text-amber-800">Your document and status are accessible only through your authenticated student account.</p>
              <button type="button" onClick={onLogin} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Student sign in</button>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" /> Loading verification status…</div>
          ) : verification && (verification.status === 'APPROVED' || verification.status === 'VERIFIED') ? (
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 p-6 shadow-xs">
              {message && <p role="status" className="mb-3 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm text-emerald-900 font-semibold">{message}</p>}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-950">Your Student Verification is Approved</h3>
                  <p className="mt-1 text-xs text-emerald-800">
                    Your student ID has been verified by the administrator. Full academic privileges and all project presentation (PPT) previews are unlocked.
                  </p>
                  <p className="mt-2 text-[11px] text-emerald-700 font-mono">Verified on {new Date(verification.updated_at || verification.created_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"><RefreshCw size={14} /> Refresh status</button>
                <button type="button" onClick={onContinue} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-xs">Explore Project Previews &rarr;</button>
              </div>
            </div>
          ) : verification && (verification.status === 'BLOCKED' || (verification.rejection_count || 0) >= 2) ? (
            <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-6 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rose-950">Account Restricted from Verification</h3>
                  <p className="mt-1 text-xs text-rose-800">
                    Your submitted ID documents were rejected 2 times. In accordance with Unikart academic verification policy, your account has been permanently restricted from submitting additional verification documents.
                  </p>
                  {verification.rejection_reason && (
                    <div className="mt-3 p-3 rounded-xl bg-rose-100 border border-rose-200 text-xs text-rose-900">
                      <strong>Rejection Feedback:</strong> {verification.rejection_reason}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-rose-600 font-semibold">
                    Attempts used: 2 of 2 • Status: Permanent Restriction
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a href="mailto:support@unikart.com?subject=Verification%20Account%20Restriction%20Inquiry" className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 shadow-xs">
                  Contact Academic Support &rarr;
                </a>
                <button type="button" onClick={onContinue} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Return to Catalogue
                </button>
              </div>
            </div>
          ) : verification && (verification.status === 'PENDING' || verification.status === 'RE-UPLOADED') ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              {message && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {verification.status === 'RE-UPLOADED'
                    ? '⚡ Your corrected submission is prioritized at the top of the queue.'
                    : 'Your submission is awaiting administrator review.'}
                </p>
                {verification.status === 'RE-UPLOADED' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-600 text-white">
                    TOP PRIORITY
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">Submitted {new Date(verification.created_at).toLocaleString()}</p>
              <p className="mt-3 text-xs text-slate-600">
                {verification.status === 'RE-UPLOADED'
                  ? 'Your re-uploaded ID documents are highlighted for urgent administrator inspection. Previous documents have been cleanly purged.'
                  : 'You will be notified after a decision. Preview access will unlock once verified.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw size={14} /> Refresh status</button>
                <button type="button" onClick={onContinue} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Continue to marketplace</button>
              </div>
            </div>
          ) : (
            <>
              {verification?.status === 'REJECTED' && (
                <div role="status" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <p className="text-sm font-bold text-amber-950">
                      Verification rejected. You have {2 - (verification.rejection_count || 1)} re-upload attempt remaining before account restriction.
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-900">
                    <strong>Admin Reason:</strong> {verification.rejection_reason || 'Please upload a clearer, valid student ID card.'}
                  </p>
                </div>
              )}
              {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">Student Full Name
                    <input required minLength={2} maxLength={100} value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="e.g. Mayank Kumar" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">Email Address
                    <input type="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} placeholder="student@example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">College / University Name
                    <input required minLength={2} maxLength={150} value={studentCollege} onChange={(event) => setStudentCollege(event.target.value)} placeholder="e.g. Usha Martin University" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">Course / Department
                    <input required minLength={2} maxLength={150} value={studentCourse} onChange={(event) => setStudentCourse(event.target.value)} placeholder="e.g. B.Tech Computer Science" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">Contact / Phone Number
                  <input required minLength={7} maxLength={32} value={paymentPhone} onChange={(event) => setPaymentPhone(event.target.value)} placeholder="+91 98765 43210" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-slate-700">Upload ID Card (Front Side)
                    <span className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
                      <Upload size={18} className="text-indigo-600" />
                      <input type="file" accept="image/png, image/jpeg" onChange={handleFileChange} required={!verification} className="min-w-0 flex-1 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 cursor-pointer" />
                    </span>
                    <span className="mt-1 block font-normal text-slate-500 text-[11px]">
                      {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'PNG or JPG only · Maximum 50 KB'}
                    </span>
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">Upload ID Card (Back Side)
                    <span className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
                      <Upload size={18} className="text-indigo-600" />
                      <input type="file" accept="image/png, image/jpeg" onChange={handleBackFileChange} className="min-w-0 flex-1 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 cursor-pointer" />
                    </span>
                    <span className="mt-1 block font-normal text-slate-500 text-[11px]">
                      {backFile ? `${backFile.name} · ${(backFile.size / 1024).toFixed(0)} KB` : 'PNG or JPG only · Maximum 50 KB'}
                    </span>
                  </label>
                </div>

                {(filePreview || backFilePreview) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-600 mb-2">Selected ID Document Previews:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filePreview && (
                        <div className="flex flex-col items-center max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Front Side</span>
                          <img src={filePreview} alt="Selected Front ID Card" className="max-h-36 object-contain rounded" />
                        </div>
                      )}
                      {backFilePreview && (
                        <div className="flex flex-col items-center max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Back Side</span>
                          <img src={backFilePreview} alt="Selected Back ID Card" className="max-h-36 object-contain rounded" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {challenge && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-700">
                      Security question: Solve {challenge.math_left} + {challenge.math_right} = ?
                      <input
                        required
                        type="number"
                        placeholder="Your answer"
                        value={puzzleAnswer}
                        onChange={(event) => {
                          setPuzzleAnswer(event.target.value);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>
                  </div>
                )}
                {!challenge && <button type="button" onClick={() => void loadChallenge()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Retry security challenge</button>}
                <button type="submit" disabled={submitting || !challenge} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? <><RefreshCw size={16} className="animate-spin" /> Submitting…</> : verification ? 'Resubmit corrected ID card' : 'Submit for verification'}
                </button>
                <p className="text-center text-[11px] text-slate-500">Documents are private and available only to authorized verification administrators.</p>
              </form>
            </>
          )}
          {accessToken && notifications.length > 0 && (
            <section aria-label="Recent verification notifications" className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-bold text-slate-900">Recent notifications</h2>
              <ul className="mt-3 space-y-2">
                {notifications.slice(0, 5).map((notification) => (
                  <li key={notification.id} className={`rounded-lg border p-3 text-xs ${notification.is_read ? 'border-slate-200 bg-white text-slate-600' : 'border-indigo-100 bg-indigo-50 text-indigo-900'}`}>
                    <p>{notification.message}</p>
                    <time className="mt-1 block text-[10px] opacity-70">{new Date(notification.created_at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
