import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import {
  StudentVerificationAPI,
  StudentNotification,
  StudentVerificationStatus,
  VerificationApiError,
  VerificationChallenge
} from './verificationService';

interface StudentVerificationPageProps {
  accessToken?: string;
  onLogin: () => void;
  onContinue: () => void;
  onSessionExpired: () => void;
  onApproved: () => void;
}

function badge(status: StudentVerificationStatus['status']) {
  if (status === 'APPROVED' || status === 'VERIFIED') {
    return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 };
  }
  if (status === 'REJECTED') {
    return { label: 'Rejected', className: 'bg-rose-100 text-rose-800', icon: AlertCircle };
  }
  return { label: 'Pending review', className: 'bg-amber-100 text-amber-800', icon: Clock3 };
}

export default function StudentVerificationPage({
  accessToken,
  onLogin,
  onContinue,
  onSessionExpired,
  onApproved
}: StudentVerificationPageProps) {
  const [verification, setVerification] = useState<StudentVerificationStatus | null>(null);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [puzzleAnswer, setPuzzleAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
        StudentVerificationAPI.getMine(accessToken),
        StudentVerificationAPI.getNotifications(accessToken)
      ]);
      setVerification(current);
      setNotifications(recentNotifications);
      if (!current || current.status === 'REJECTED') await loadChallenge();
      if (current?.status === 'APPROVED' || current?.status === 'VERIFIED') onApproved();
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
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      onLogin();
      return;
    }
    if (!file || !challenge) {
      setError('Choose a student ID document and complete the verification challenge.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setError('Upload a JPEG, PNG, or PDF document.');
      return;
    }
    if (file.size > 2_000_000) {
      setError('The document must be no larger than 2 MB.');
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
      await StudentVerificationAPI.submit(
        accessToken,
        file,
        paymentPhone,
        challenge,
        captchaAnswer.trim().toUpperCase(),
        answer
      );
      setMessage(verification ? 'Resubmission received. Your updated document is pending review.' : 'Your document was submitted and is pending review.');
      setFile(null);
      setCaptchaAnswer('');
      setPuzzleAnswer('');
      setLoading(true);
      await refresh();
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
          ) : verification && verification.status !== 'REJECTED' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              {message && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
              <p className="text-sm font-semibold text-slate-900">
                {verification.status === 'APPROVED' || verification.status === 'VERIFIED'
                  ? 'Your student account is verified.'
                  : 'Your submission is awaiting administrator review.'}
              </p>
              <p className="mt-1 text-xs text-slate-600">Submitted {new Date(verification.created_at).toLocaleString()}</p>
              {verification.status === 'PENDING' && <p className="mt-3 text-xs text-slate-600">You will be notified after a decision. Preview access remains subject to project eligibility and quota rules.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw size={14} /> Refresh status</button>
                <button type="button" onClick={onContinue} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Continue to marketplace</button>
              </div>
            </div>
          ) : (
            <>
              {verification?.status === 'REJECTED' && (
                <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-900">A corrected document is required.</p>
                  <p className="mt-1 text-sm text-rose-800">{verification.rejection_reason || 'Please upload a clearer, valid student ID card.'}</p>
                </div>
              )}
              {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
              <form onSubmit={submit} className="space-y-4">
                <label className="block text-xs font-semibold text-slate-700">Payment receiving phone number
                  <input required minLength={7} maxLength={32} value={paymentPhone} onChange={(event) => setPaymentPhone(event.target.value)} placeholder="+91 98765 43210" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                </label>
                <label className="block text-xs font-semibold text-slate-700">Student ID card (JPEG, PNG, or PDF · maximum 2 MB)
                  <span className="mt-1 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
                    <Upload size={20} className="text-indigo-600" />
                    <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} required={!verification} className="min-w-0 flex-1 text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" />
                  </span>
                  {file && <span className="mt-1 block font-normal text-slate-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
                </label>
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
                          setCaptchaAnswer(event.target.value);
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
