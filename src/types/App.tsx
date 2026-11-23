import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, Search, Filter, Heart, Calendar, CheckCircle2,
  Lock, FileText, FolderKanban, Award, HelpCircle, LogOut, Menu, X, ChevronRight,
  ChevronLeft, Upload, ExternalLink, CreditCard,
  Layers, Code2, Cpu, Smartphone, Database, Cloud, Sparkles,
  Check, UserCheck, Eye, EyeOff, LayoutDashboard, Copy, Share2, RefreshCw,
  AlertCircle, AlertTriangle, Clock, Mail, Bot
} from 'lucide-react';
import {
  ProjectCategory, ProjectDTO,
  MeetingRecord, SupportTicket, StudentProfile
} from './types';
import {
  INITIAL_STUDENT, INITIAL_MEETINGS,
  INITIAL_TICKETS, AVAILABLE_TIME_SLOTS
} from './mockData';
import { AdminAuthAPI, AdminAuthError } from './adminAuthService';
import { getPublicProjects, ProjectCatalogueError, useMockCatalogue } from './projectCatalogueService';
import StudentVerificationPage from './StudentVerificationPage';
import { StudentAuthAPI, StudentTokenResponse, VerificationApiError, StudentVerificationAPI } from './verificationService';
import { StudentCommerceAPI, StudentOrderRecord } from './commerceService';
import StudentCommercePanel from './StudentCommercePanel';
import AdminDashboard from './admin/AdminDashboard';
import StudentReferralPage from './StudentReferralPage';
import { ReferralApiError, StudentReferralAPI } from './referralService';
import { supabase } from '../supabaseClient';
import StudentLogin from './StudentLogin';
import StudentSignup from './StudentSignup';
import ProfilePage from './ProfilePage';
import { matchSupportAutoReply, SUPPORT_OFFICIAL_EMAIL, SUPPORT_PRESET_QUESTIONS, getPresetAnswer } from './supportService';
import TransparentBrandLogo from './TransparentBrandLogo';
import UnikartLoader from './UnikartLoader';

type PageRoute =
  | 'home'
  | 'explore'
  | 'project-details'
  | 'ppt-preview'
  | 'how-it-works'
  | 'login'
  | 'signup'
  | 'profile'
  | 'admin-login'
  | 'admin-change-password'
  | 'verification'
  | 'selected-projects'
  | 'schedule-meet'
  | 'dashboard'
  | 'referrals'
  | 'checkout'
  | 'support'
  | 'privacy'
  | 'terms'
  | 'refund'
  | 'admin'
  | 'mentor';

const CATEGORIES: { name: ProjectCategory; icon: React.ReactNode; count: string }[] = [
  { name: 'Web Development', icon: <Code2 className="w-5 h-5 text-indigo-600" />, count: '45+ Projects' },
  { name: 'Artificial Intelligence', icon: <Sparkles className="w-5 h-5 text-emerald-600" />, count: '30+ Projects' },
  { name: 'Machine Learning', icon: <Cpu className="w-5 h-5 text-violet-600" />, count: '38+ Projects' },
  { name: 'Internet of Things', icon: <Layers className="w-5 h-5 text-amber-600" />, count: '22+ Projects' },
  { name: 'Android Development', icon: <Smartphone className="w-5 h-5 text-blue-600" />, count: '28+ Projects' },
  { name: 'Cybersecurity', icon: <ShieldCheck className="w-5 h-5 text-rose-600" />, count: '19+ Projects' },
  { name: 'Data Science', icon: <Database className="w-5 h-5 text-teal-600" />, count: '34+ Projects' },
  { name: 'Cloud Computing', icon: <Cloud className="w-5 h-5 text-sky-600" />, count: '16+ Projects' },
];

export const getStudentStorageKey = (stu?: { email?: string; id?: string }): string => {
  const email = stu?.email?.toLowerCase().trim();
  if (email) return email;
  const id = stu?.id?.trim();
  if (id && id !== 'STU-000-000') return id;
  return 'default_user';
};

export const getScopedViewedProjects = (userKey: string): string[] => {
  if (!userKey || userKey === 'default_user') return [];
  try {
    const raw = localStorage.getItem(`cpm_viewed_projects_${userKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch { /* ignore */ }
  return [];
};

export const resolveUserPreviewStats = (stu?: {
  email?: string;
  id?: string;
  viewedProjectIds?: string[];
  previewStats?: any;
}) => {
  const userKey = getStudentStorageKey(stu);
  const storedViewed = getScopedViewedProjects(userKey);
  const combinedViewed = Array.from(
    new Set([
      ...(Array.isArray(stu?.viewedProjectIds) ? stu!.viewedProjectIds : []),
      ...storedViewed,
    ])
  );

  const totalAllowed = 5;
  const usedPreviews = combinedViewed.length;
  const remainingPreviews = Math.max(0, totalAllowed - usedPreviews);

  return {
    viewedProjectIds: combinedViewed,
    previewStats: {
      totalAllowed,
      usedPreviews,
      remainingPreviews,
      nextResetDate: stu?.previewStats?.nextResetDate || '90-Day Cycle',
    },
  };
};

export default function App() {
  // Persistent state using localStorage
  const [currentRoute, setCurrentRoute] = useState<PageRoute>(() => {
    const hasReferralCode = new URLSearchParams(window.location.search).has('ref');
    return window.location.pathname.replace(/\/+$/, '') === '/register' || hasReferralCode
      ? 'signup'
      : 'home';
  });

  const [student, setStudent] = useState<StudentProfile>(() => {
    const saved = localStorage.getItem('cpm_student_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.authState && parsed.authState !== 'logged_out' && (parsed.email || parsed.id)) {
          const { viewedProjectIds, previewStats } = resolveUserPreviewStats(parsed);
          return {
            ...parsed,
            viewedProjectIds,
            previewStats,
          };
        }
      } catch { /* fallback */ }
    }
    return {
      ...INITIAL_STUDENT,
      authState: 'logged_out',
      previewStats: {
        totalAllowed: 5,
        usedPreviews: 0,
        remainingPreviews: 5,
        nextResetDate: '90-Day Cycle',
      },
      viewedProjectIds: [],
    };
  });

  useEffect(() => {
    const persistedStudent = { ...student };
    localStorage.setItem('cpm_student_session', JSON.stringify(persistedStudent));
  }, [student]);

  // Synchronize student verification lifecycle with Supabase in real-time
  useEffect(() => {
    if (student.authState === 'logged_out') return;
    const studentId = student.id || 'STU-2026-0001';
    const email = student.email || '';
    const numericPart = studentId.replace(/\D/g, '');
    const numId = numericPart ? Number(numericPart) : null;

    const syncStatus = async () => {
      try {
        let orList: string[] = [];
        if (studentId) orList.push(`student_id_code.eq.${studentId}`);
        if (email) orList.push(`email.eq.${email}`);
        if (student.mobile) {
          const digits = student.mobile.replace(/\D/g, '');
          const last10 = digits.slice(-10);
          if (last10) {
            orList.push(`phone.ilike.%${last10}%`);
          }
        }
        if (numId) {
          orList.push(`user_id.eq.${numId}`);
          orList.push(`id.eq.${numId}`);
        }

        if (orList.length === 0) return;

        const query = supabase.from('verifications').select('*').or(orList.join(','));

        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const row = data[0];
          const rejCount = Number(row.rejection_count || 0);
          if (row.status === 'APPROVED' || row.status === 'VERIFIED') {
            setStudent((prev) => {
              const { viewedProjectIds, previewStats } = resolveUserPreviewStats(prev);
              return {
                ...prev,
                authState: 'verified',
                rejectionCount: 0,
                rejectionReason: undefined,
                viewedProjectIds,
                previewStats,
              };
            });
          } else if (row.status === 'BLOCKED' || rejCount >= 2) {
            setStudent((prev) => (prev.authState === 'verification_blocked' && prev.rejectionCount === rejCount && prev.rejectionReason === row.rejection_reason ? prev : {
              ...prev,
              authState: 'verification_blocked',
              rejectionCount: rejCount >= 2 ? rejCount : 2,
              rejectionReason: row.rejection_reason || undefined
            }));
          } else if (row.status === 'REJECTED') {
            setStudent((prev) => (prev.authState === 'verification_rejected' && prev.rejectionCount === rejCount && prev.rejectionReason === row.rejection_reason ? prev : {
              ...prev,
              authState: 'verification_rejected',
              rejectionCount: rejCount || 1,
              rejectionReason: row.rejection_reason || undefined
            }));
          } else if (row.status === 'PENDING' || row.status === 'RE-UPLOADED') {
            setStudent((prev) => (prev.authState === 'verification_pending' ? prev : {
              ...prev,
              authState: 'verification_pending',
              rejectionCount: rejCount,
              rejectionReason: undefined
            }));
          }
        }
      } catch {
        /* fallback to existing session */
      }
    };
    void syncStatus();

    // Supabase Real-time channel for verification updates
    const channel = supabase
      .channel('student-verification-lifecycle')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, () => {
        void syncStatus();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const newNotif = payload.new as any;
        if (newNotif && (newNotif.student_id === studentId || newNotif.email === email || (numId && String(newNotif.user_id) === String(numId)))) {
          void syncStatus();
        }
      })
      .subscribe();

    // In-browser custom event listeners for instant reactivity
    const handleVerificationUpdated = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail) {
        const { status, rejectionReason, rejectionCount } = customEvt.detail;
        if (status === 'APPROVED') {
          setStudent((prev) => {
            const { viewedProjectIds, previewStats } = resolveUserPreviewStats(prev);
            return {
              ...prev,
              authState: 'verified',
              rejectionCount: 0,
              rejectionReason: undefined,
              viewedProjectIds,
              previewStats,
            };
          });
        } else if (status === 'BLOCKED') {
          setStudent((prev) => ({ ...prev, authState: 'verification_blocked', rejectionCount: rejectionCount || 2, rejectionReason }));
        } else if (status === 'REJECTED') {
          setStudent((prev) => ({ ...prev, authState: 'verification_rejected', rejectionCount: rejectionCount || 1, rejectionReason }));
        }
      }
      void syncStatus();
    };

    const handleNewNotification = () => {
      void syncStatus();
    };

    window.addEventListener('unikart:verification_updated', handleVerificationUpdated);
    window.addEventListener('unikart:new_notification', handleNewNotification);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener('unikart:verification_updated', handleVerificationUpdated);
      window.removeEventListener('unikart:new_notification', handleNewNotification);
    };
  }, [student.authState, student.email, student.id]);

  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string>('PRJ-101');
  const [meetings, setMeetings] = useState<MeetingRecord[]>(INITIAL_MEETINGS);
  const [tickets, setTickets] = useState<SupportTicket[]>(() => {
    try {
      const saved = localStorage.getItem('cpm_support_tickets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return INITIAL_TICKETS;
  });
  const [latestSubmittedTicket, setLatestSubmittedTicket] = useState<SupportTicket | null>(null);
  const [selectedSupportQId, setSelectedSupportQId] = useState<string>('id-verification');
  const [appBootLoading, setAppBootLoading] = useState(true);
  const [pageTransitionLoading, setPageTransitionLoading] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppBootLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const getRouteLabel = (route: string) => {
    switch (route) {
      case 'home': return 'Home';
      case 'explore': return 'Explore Projects';
      case 'project-details': return 'Project Details';
      case 'ppt-preview': return 'PPT Preview';
      case 'selected-projects': return 'Selected Projects';
      case 'schedule-meet': return '5-Minute Guidance Meeting';
      case 'checkout': return 'Checkout';
      case 'dashboard': return 'Student Profile';
      case 'referrals': return 'Referral Network & Team';
      case 'support': return 'Customer Support';
      case 'login': return 'Student Login';
      case 'signup': return 'Student Registration';
      case 'admin':
      case 'admin-login': return 'Admin Workspace';
      default: return 'Page';
    }
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shareEarnModalOpen, setShareEarnModalOpen] = useState(false);
  const [copiedProfileCode, setCopiedProfileCode] = useState(false);
  const [copiedModalCode, setCopiedModalCode] = useState(false);
  const [copiedModalLink, setCopiedModalLink] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'activity' | 'meetings' | 'referrals' | 'purchases' | 'support'>('overview');
  const referralCodeFromUrl = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('ref')?.trim() || '';
    } catch {
      return '';
    }
  }, []);

  const currentStudentName = student.fullName || 'Janki';
  const currentStudentId = (student.id && student.id !== 'STU-000-000') ? student.id : 'STU-2026-0001';
  const currentAkReferralCode = student.referralCode || student.id || '';
  const currentCollege = student.collegeName || 'Janak University';
  const currentReferralLink = typeof window !== 'undefined'
    ? `${window.location.origin}/register?ref=${currentAkReferralCode}`
    : `https://unikart.com/register?ref=${currentAkReferralCode}`;
  const [adminUserId, setAdminUserId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminLoginMessage, setAdminLoginMessage] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminSession, setAdminSession] = useState<{ accessToken: string; mustChangePassword: boolean } | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [adminPasswordMessage, setAdminPasswordMessage] = useState('');
  const [studentContact, setStudentContact] = useState('');
  const [studentOtp, setStudentOtp] = useState('');
  const [studentOtpRequested, setStudentOtpRequested] = useState(false);
  const [studentSignupName, setStudentSignupName] = useState('');
  const [studentSignupCollege, setStudentSignupCollege] = useState('');
  const [studentSignupCourse, setStudentSignupCourse] = useState('');
  const [studentAuthMessage, setStudentAuthMessage] = useState('');
  const [studentAuthLoading, setStudentAuthLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [selectedTech, setSelectedTech] = useState<string>('All');

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pptViewMode, setPptViewMode] = useState<'embedded' | 'slides'>('embedded');

  const [checkoutProjectId, setCheckoutProjectId] = useState<string>('PRJ-101');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<StudentOrderRecord | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [checkoutUtr, setCheckoutUtr] = useState<string>('');
  const [checkoutScreenshotFile, setCheckoutScreenshotFile] = useState<File | null>(null);
  const [checkoutScreenshotPreview, setCheckoutScreenshotPreview] = useState<string>('');
  const [checkoutScreenshotError, setCheckoutScreenshotError] = useState<string>('');
  const [checkoutUpiCopied, setCheckoutUpiCopied] = useState<boolean>(false);

  // Student ID Card Verification Upload States
  const [idCardFrontFile, setIdCardFrontFile] = useState<File | null>(null);
  const [idCardBackFile, setIdCardBackFile] = useState<File | null>(null);
  const [idCardFrontPreview, setIdCardFrontPreview] = useState<string>('');
  const [idCardBackPreview, setIdCardBackPreview] = useState<string>('');
  const [idCardSubmitting, setIdCardSubmitting] = useState<boolean>(false);

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
      showToast('File size must be 50 KB or below and in PNG/JPG format.', 'error');
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
      showToast('File size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }

    setIdCardBackFile(file);
    const reader = new FileReader();
    reader.onload = () => setIdCardBackPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitStudentVerification = async () => {
    if (student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2) {
      showToast('Account is permanently restricted from further verification submissions (maximum 2 attempts reached).', 'error');
      return;
    }
    if (!idCardFrontFile) {
      showToast('Please select at least the ID Card (Front Side) image.', 'error');
      return;
    }
    if (!isValidIdCardFormat(idCardFrontFile) || idCardFrontFile.size > 50 * 1024) {
      showToast('File size must be 50 KB or below and in PNG/JPG format.', 'error');
      return;
    }
    if (idCardBackFile && (!isValidIdCardFormat(idCardBackFile) || idCardBackFile.size > 50 * 1024)) {
      showToast('File size must be 50 KB or below and in PNG/JPG format.', 'error');
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

      // Resolve student identity dynamically without hardcoded fallback
      let targetEmail = student.email?.trim() || '';
      if (!targetEmail) {
        const { data: sessionData } = await supabase.auth.getSession();
        targetEmail = sessionData?.session?.user?.email?.trim() || '';
      }

      if (!targetEmail) {
        showToast('Please sign in or enter your registered student email before submitting verification.', 'error');
        setIdCardSubmitting(false);
        return;
      }

      const targetName = student.fullName?.trim() || targetEmail.split('@')[0] || 'Student';
      const targetCollege = student.collegeName?.trim() || 'University Student';
      const targetCourse = student.department?.trim() || 'Degree Program';
      const targetId = (student.id && student.id !== 'STU-000-000') ? student.id : `STU-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const targetReferralCode = student.referralCode || targetId;
      const targetPhone = student.mobile?.trim() || '';

      // Build standard multipart FormData
      const formData = new FormData();
      formData.append('front_image', idCardFrontFile);
      if (idCardBackFile) {
        formData.append('back_image', idCardBackFile);
      }
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

      setStudent((prev) => ({ ...prev, authState: 'verification_pending', rejectionReason: undefined }));
      showToast(
        isReupload
          ? 'Corrected ID documents re-submitted! Prioritized at top of admin queue.'
          : 'ID documents (Front & Back) successfully submitted! Admin review pending.',
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit ID documents. Please try again.', 'error');
    } finally {
      setIdCardSubmitting(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    let active = true;
    void getPublicProjects()
      .then((result) => {
        if (active) {
          setCatalogueError('');
          setProjects(result);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogueError(
            error instanceof ProjectCatalogueError
              ? error.message
              : 'Unable to load the project catalogue.'
          );
        }
      })
      .finally(() => {
        if (active) setCatalogueLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Real-time Supabase subscription for public projects
  useEffect(() => {
    const channel = supabase
      .channel('public-projects-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          void getPublicProjects()
            .then((result) => {
              setCatalogueError('');
              setProjects(result);
            })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Real-time listener for catalogue updates dispatched from Admin or storage
  useEffect(() => {
    const handleCatalogUpdate = () => {
      void getPublicProjects()
        .then((result) => {
          setCatalogueError('');
          setProjects(result);
        })
        .catch(() => {});
    };
    window.addEventListener('unikart-catalogue-updated', handleCatalogUpdate);
    return () => {
      window.removeEventListener('unikart-catalogue-updated', handleCatalogUpdate);
    };
  }, []);

  const loadPublicCatalogue = useCallback(async () => {
    if (useMockCatalogue) return;
    setCatalogueLoading(true);
    try {
      const result = await getPublicProjects();
      setCatalogueError('');
      setProjects(result);
    } catch (error) {
      setCatalogueError(
        error instanceof ProjectCatalogueError
          ? error.message
          : 'Unable to load the project catalogue.'
      );
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  const copyText = async (value: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
  };

  const navigate = (route: PageRoute) => {
    if (route !== currentRoute) {
      setPageTransitionLoading(true);
      setTransitionTarget(route);
      window.scrollTo({ top: 0, behavior: 'instant' });
      setTimeout(() => {
        setCurrentRoute(route);
        setPageTransitionLoading(false);
      }, 140);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const handleAdminSessionExpired = useCallback(() => {
    setAdminSession(null);
    setAdminLoginMessage('Your Admin session expired. Please sign in again.');
    setCurrentRoute('admin-login');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleStudentSessionExpired = useCallback(() => {
    setStudent((previous) => ({
      ...previous,
      accessToken: undefined,
      authState: 'logged_out'
    }));
    setStudentOtpRequested(false);
    setStudentAuthMessage('Your student session expired. Please sign in again.');
    setCurrentRoute('login');
  }, []);

  const handleStudentApproved = useCallback(() => {
    setStudent((previous) => {
      const { viewedProjectIds, previewStats } = resolveUserPreviewStats(previous);
      return {
        ...previous,
        authState: 'verified',
        rejectionCount: 0,
        rejectionReason: undefined,
        viewedProjectIds,
        previewStats,
      };
    });
  }, []);

  const handleStudentSelectionsLoaded = useCallback((projectIds: string[]) => {
    setStudent((previous) => ({ ...previous, selectedProjectIds: projectIds }));
  }, []);

  const handleMeetingsLoaded = useCallback((loadedMeetings: any[]) => {
    const mapped: MeetingRecord[] = loadedMeetings.map((m) => ({
      id: String(m.id),
      projectId: String(m.project_id),
      projectTitle: m.project_title,
      date: m.requested_date || (m.start_time ? new Date(m.start_time).toISOString().slice(0, 10) : ''),
      timeSlot: m.time_slot || '5-Min Slot',
      durationMinutes: 5,
      status: m.status as any,
      meetLink: m.google_meet_url || undefined
    }));
    setMeetings(mapped);
  }, []);

  useEffect(() => {
    const studentIdentifier = student.id || student.email;
    if (!studentIdentifier || studentIdentifier === 'STU-000-000') return;
    let active = true;
    void StudentCommerceAPI.listMeetings(student.accessToken, {
      studentId: student.id,
      studentEmail: student.email
    })
      .then((liveMeetings) => {
        if (!active) return;
        const mapped: MeetingRecord[] = liveMeetings.map((m) => ({
          id: String(m.id),
          projectId: String(m.project_id),
          projectTitle: m.project_title,
          date: m.requested_date || (m.start_time ? new Date(m.start_time).toISOString().slice(0, 10) : ''),
          timeSlot: m.time_slot || '5-Min Slot',
          durationMinutes: 5,
          status: m.status as any,
          meetLink: m.google_meet_url || undefined
        }));
        setMeetings(mapped);
      })
      .catch((err) => {
        console.warn('Could not load student meetings for overview dashboard:', err);
      });
    return () => {
      active = false;
    };
  }, [student.id, student.email, student.accessToken]);

  useEffect(() => {
    if (!student.accessToken) return;
    let active = true;
    void StudentCommerceAPI.listSelections(student.accessToken)
      .then((selections) => {
        if (active) {
          setStudent((previous) => ({
            ...previous,
            selectedProjectIds: selections.map((selection) => String(selection.project_id))
          }));
        }
      })
      .catch((error: unknown) => {
        if (active && error instanceof VerificationApiError && [401, 403].includes(error.status)) {
          handleStudentSessionExpired();
        }
      });
    return () => {
      active = false;
    };
  }, [handleStudentSessionExpired, student.accessToken]);

  // Listen to Supabase Auth state changes for Google OAuth & Email authentication
  useEffect(() => {
    const handleAuthUserSession = async (user: any, token?: string) => {
      const email = user?.email;
      if (!email) return;

      try {
        // Query Supabase verifications table matching email
        const { data: verifRows } = await supabase
          .from('verifications')
          .select('*')
          .or(`email.ilike.${email},email.eq.${email},user_id.eq.${user.id}`)
          .order('updated_at', { ascending: false })
          .limit(1);

        const verif = verifRows?.[0];
        const isVerified = verif?.status === 'APPROVED' || verif?.status === 'VERIFIED';
        const randomSuffix = user.id ? user.id.slice(0, 4).toUpperCase() : Math.floor(1000 + Math.random() * 9000);
        const studentId = verif?.student_id_code || `STU-2026-${randomSuffix}`;
        const studentName = verif?.student_name || user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
        const referralCode = verif?.referral_code || verif?.student_id_code || studentId;
        const college = verif?.college || user.user_metadata?.college || 'University Student';
        const course = verif?.course || user.user_metadata?.course || 'Degree Program';
        const status = verif?.status;
        const rejCount = Number(verif?.rejection_count || 0);

        setStudent((prev) => ({
          ...prev,
          id: studentId,
          fullName: studentName,
          email: email,
          mobile: verif?.phone || prev.mobile || '',
          collegeName: college,
          department: course,
          referralCode: referralCode,
          accessToken: token || prev.accessToken || 'supabase-oauth-token',
          authState: isVerified
            ? 'verified'
            : status === 'BLOCKED' || rejCount >= 2
            ? 'verification_blocked'
            : status === 'REJECTED'
            ? 'verification_rejected'
            : status === 'PENDING' || status === 'RE-UPLOADED'
            ? 'verification_pending'
            : 'verification_pending',
          rejectionCount: rejCount,
          rejectionReason: verif?.rejection_reason || undefined,
          role: 'student'
        }));

        // Clean OAuth hash from address bar (e.g. #access_token=...)
        if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        navigate('dashboard');
        showToast(`Welcome back, ${studentName}! Authenticated successfully.`, 'success');
      } catch (err) {
        console.warn('Failed to load user profile on auth change:', err);
      }
    };

    // 1. Initial check for existing active session (e.g. on OAuth redirect callback)
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email && student.authState === 'logged_out') {
          await handleAuthUserSession(session.user, session.access_token);
        }
      } catch (err) {
        console.warn('Initial session check error:', err);
      }
    };
    void checkSession();

    // 2. Auth state change listener (Google OAuth & Email verification)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user?.email && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        await handleAuthUserSession(session.user, session.access_token);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const requestStudentOtp = async (mode: 'login' | 'signup') => {
    const contact = studentContact.trim();
    if (!contact) {
      setStudentAuthMessage('Enter your student email address.');
      return;
    }
    if (mode === 'signup' && (!studentSignupName.trim() || !studentSignupCollege.trim() || !studentSignupCourse.trim())) {
      setStudentAuthMessage('Enter your name, college or university, and course.');
      return;
    }

    setStudentAuthLoading(true);
    setStudentAuthMessage('');
    try {
      if (mode === 'signup' && referralCodeFromUrl) {
        const validReferral = await StudentReferralAPI.validateCode(referralCodeFromUrl);
        if (!validReferral) throw new ReferralApiError('This referral link is invalid or inactive.', 404);
      }
      if (mode === 'login') {
        const cleanEmail = contact.toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          const err = 'Please enter a valid student email address (e.g. student@umu.ac.in).';
          setStudentAuthMessage(err);
          showToast(err, 'error');
          setStudentAuthLoading(false);
          return;
        }

        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://unikart.com';
        const { data, error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            emailRedirectTo: redirectUrl
          }
        });

        if (error) {
          console.warn('Supabase signInWithOtp error:', error.message);
          showToast(error.message, 'error');
          setStudentAuthMessage(error.message);
          setStudentAuthLoading(false);
          return;
        }

        setStudentOtpRequested(true);
        showToast(`One-time sign-in code sent to ${cleanEmail}! Please check your email inbox.`, 'success');
        setStudentAuthMessage(`Sign-in code dispatched to ${cleanEmail}. Enter the one-time code to complete verification.`);
        setStudentAuthLoading(false);
        return;
      }

      const response = await StudentAuthAPI.requestSignupOtp({
        full_name: studentSignupName.trim(),
        department: studentSignupCourse.trim(),
        university_name: studentSignupCollege.trim(),
        contact_type: contact.includes('@') ? 'email' : 'phone',
        contact_value: contact,
        referral_code: referralCodeFromUrl || undefined
      });
      setStudentOtpRequested(true);
      setStudentAuthMessage(response.code
        ? `Development OTP (no SMS/email provider is configured): ${response.code}`
        : 'OTP requested. Enter the code delivered to your contact.');
    } catch (requestError) {
      setStudentAuthMessage(
        requestError instanceof VerificationApiError
          ? requestError.message
          : requestError instanceof Error ? requestError.message : 'Unable to request a sign-in code.'
      );
    } finally {
      setStudentAuthLoading(false);
    }
  };

  const verifyStudentOtp = async (mode: 'login' | 'signup') => {
    if (!studentOtp.trim()) {
      setStudentAuthMessage('Enter the one-time code.');
      return;
    }
    setStudentAuthLoading(true);
    setStudentAuthMessage('');
    try {
      const contact = studentContact.trim();

      if (mode === 'login') {
        const cleanEmail = contact.toLowerCase();
        const { data, error } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: studentOtp.trim(),
          type: 'email'
        });

        if (error) {
          console.warn('Supabase verifyOtp error:', error.message);
          showToast(error.message, 'error');
          setStudentAuthMessage(error.message);
          setStudentAuthLoading(false);
          return;
        }

        const session = data?.session;
        const user = data?.user || session?.user;

        // Query verifications table matching email
        let verifRecord: any = null;
        try {
          const { data: rows } = await supabase
            .from('verifications')
            .select('*')
            .or(`email.ilike.${cleanEmail},email.eq.${cleanEmail},user_id.eq.${user?.id || ''}`)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (rows && rows.length > 0) verifRecord = rows[0];
        } catch (dbErr) {
          console.warn('Lookup error in verifyStudentOtp:', dbErr);
        }

        const isVerified = verifRecord?.status === 'APPROVED' || verifRecord?.status === 'VERIFIED';
        const randomSuffix = user?.id ? user.id.slice(0, 4).toUpperCase() : Math.floor(1000 + Math.random() * 9000);
        const studentId = verifRecord?.student_id_code || `STU-2026-${randomSuffix}`;
        const studentName = verifRecord?.student_name || user?.user_metadata?.full_name || user?.user_metadata?.name || cleanEmail.split('@')[0];
        const referralCode = verifRecord?.referral_code || verifRecord?.student_id_code || studentId;

        setStudent({
          ...INITIAL_STUDENT,
          id: studentId,
          accessToken: session?.access_token || 'supabase-token',
          fullName: studentName,
          email: cleanEmail,
          mobile: verifRecord?.phone || '',
          collegeName: verifRecord?.college || user?.user_metadata?.college || 'University Student',
          department: verifRecord?.course || user?.user_metadata?.course || 'Degree Program',
          referralCode: referralCode,
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
            : 'verification_pending',
          role: 'student'
        });

        setStudentOtpRequested(false);
        setStudentOtp('');
        setStudentAuthMessage('');
        showToast(`Welcome back, ${studentName}! Authenticated successfully.`, 'success');
        navigate('dashboard');
        return;
      }

      const response: StudentTokenResponse = await StudentAuthAPI.verifySignupOtp({
        full_name: studentSignupName.trim(),
        department: studentSignupCourse.trim(),
        university_name: studentSignupCollege.trim(),
        contact_type: contact.includes('@') ? 'email' : 'phone',
        contact_value: contact,
        code: studentOtp.trim(),
        referral_code: referralCodeFromUrl || undefined
      });
      setStudent({
        ...INITIAL_STUDENT,
        id: String(response.user_id),
        accessToken: response.access_token,
        fullName: studentSignupName.trim() || student.fullName,
        email: contact.includes('@') ? contact : '',
        mobile: contact.includes('@') ? '' : contact,
        collegeName: studentSignupCollege.trim() || student.collegeName,
        authState: 'logged_in',
        role: 'student'
      });
      setStudentOtpRequested(false);
      setStudentOtp('');
      setStudentAuthMessage('');
      navigate('verification');
    } catch (requestError) {
      setStudentAuthMessage(
        requestError instanceof VerificationApiError
          ? requestError.message
          : requestError instanceof Error ? requestError.message : 'Unable to verify the one-time code.'
      );
    } finally {
      setStudentAuthLoading(false);
    }
  };

  const handleAdminLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminUserId.trim() || !adminPassword) {
      setAdminLoginMessage('Enter your Admin User ID and password.');
      return;
    }

    setAdminSubmitting(true);
    setAdminLoginMessage('');
    try {
      const response = await AdminAuthAPI.login(adminUserId.trim(), adminPassword);
      setAdminSession({
        accessToken: response.access_token,
        mustChangePassword: response.must_change_password
      });
      setAdminPassword('');
      if (response.must_change_password) {
        navigate('admin-change-password');
      } else {
        navigate('admin');
      }
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setAdminLoginMessage('Invalid Admin User ID or password.');
      } else if (error instanceof AdminAuthError && error.status === 429) {
        setAdminLoginMessage(error.message);
      } else {
        setAdminLoginMessage(error instanceof Error ? error.message : 'Unable to reach the authentication service.');
      }
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminPasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminSession || !adminSession.mustChangePassword) {
      setAdminPasswordMessage('Admin authentication is required.');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setAdminPasswordMessage('The passwords do not match.');
      return;
    }
    if (
      newAdminPassword.length < 12 ||
      !/[a-z]/.test(newAdminPassword) ||
      !/[A-Z]/.test(newAdminPassword) ||
      !/[0-9]/.test(newAdminPassword) ||
      !/[^A-Za-z0-9]/.test(newAdminPassword)
    ) {
      setAdminPasswordMessage('Use at least 12 characters with lowercase, uppercase, a number, and a symbol.');
      return;
    }

    setAdminSubmitting(true);
    setAdminPasswordMessage('');
    try {
      const response = await AdminAuthAPI.changePassword(newAdminPassword, adminSession.accessToken);
      setAdminSession({ accessToken: response.access_token, mustChangePassword: false });
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      navigate('admin');
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setAdminSession(null);
        navigate('admin-login');
        setAdminLoginMessage('Your Admin session expired. Please sign in again.');
      } else {
        setAdminPasswordMessage(error instanceof Error ? error.message : 'Unable to update the password.');
      }
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminLogout = async () => {
    if (!adminSession) {
      navigate('admin-login');
      return;
    }
    setAdminSubmitting(true);
    try {
      await AdminAuthAPI.logout(adminSession.accessToken);
      setAdminSession(null);
      navigate('admin-login');
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setAdminSession(null);
        navigate('admin-login');
      } else {
        showToast(
          error instanceof Error ? `Logout failed: ${error.message}` : 'Logout failed. The server session may still be active.',
          'error'
        );
      }
    } finally {
      setAdminSubmitting(false);
    }
  };

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) || projects[0] || null, [projects, activeProjectId]);
  const checkoutProject = useMemo(() => projects.find((p) => p.id === checkoutProjectId) || projects[0] || null, [projects, checkoutProjectId]);

  const handleViewProject = (projectId: string) => {
    setActiveProjectId(projectId);
    navigate('project-details');
  };

  const handleOpenPptPreview = (project: ProjectDTO) => {
    if (project.availability === 'SOLD_OUT') {
      showToast('This project is Sold Out. New previews are unavailable.', 'error');
      return;
    }
    if (!project.previewEligible) {
      showToast('A presentation preview is not available for this project.', 'error');
      return;
    }
    if (student.authState === 'logged_out') {
      showToast('Please log in and verify your student ID to access PPT previews.', 'error');
      navigate('login');
      return;
    }
    if (student.authState !== 'verified') {
      showToast('Access restricted: Only verified students can view protected PPT previews.', 'error');
      navigate('dashboard');
      return;
    }

    const userKey = getStudentStorageKey(student);
    const storedViewed = getScopedViewedProjects(userKey);
    const combinedViewed = Array.from(new Set([...(student.viewedProjectIds || []), ...storedViewed]));
    const alreadyViewed = combinedViewed.includes(project.id);

    if (!alreadyViewed && combinedViewed.length >= 5) {
      showToast(`Preview limit reached (0/5 credits left). Next reset: ${student.previewStats?.nextResetDate || '90-Day Cycle'}`, 'error');
      return;
    }

    if (!alreadyViewed) {
      const updatedViewed = [...combinedViewed, project.id];
      try {
        localStorage.setItem(`cpm_viewed_projects_${userKey}`, JSON.stringify(updatedViewed));
      } catch { /* ignore */ }
      const newStats = resolveUserPreviewStats({ ...student, viewedProjectIds: updatedViewed });
      setStudent((prev) => ({
        ...prev,
        viewedProjectIds: updatedViewed,
        previewStats: newStats.previewStats,
      }));
      showToast('1 PPT Preview Credit used. Watermarked preview unlocked.', 'info');
    }

    setActiveProjectId(project.id);
    setCurrentSlideIndex(0);
    setPptViewMode('embedded');
    navigate('ppt-preview');
  };

  const handleToggleSelectProject = async (projectId: string) => {
    if (projects.find((project) => project.id === projectId)?.availability === 'SOLD_OUT') {
      showToast('Sold Out projects cannot be selected for new guidance requests.', 'error');
      return;
    }
    if (student.authState !== 'verified') {
      showToast('Only verified students can select projects for meetings.', 'error');
      return;
    }
    if (!student.accessToken) {
      showToast('Sign in to save a project selection.', 'error');
      navigate('login');
      return;
    }
    const isSelected = student.selectedProjectIds.includes(projectId);
    if (!isSelected && student.selectedProjectIds.length >= 3) {
      showToast('Maximum limit reached: You can select up to 3 projects for guidance meetings.', 'error');
      return;
    }
    try {
      if (isSelected) {
        await StudentCommerceAPI.removeSelection(student.accessToken, Number(projectId));
        setStudent((prev) => ({
          ...prev,
          selectedProjectIds: prev.selectedProjectIds.filter((id) => id !== projectId),
        }));
        showToast('Project removed from your selected list.', 'info');
      } else {
        await StudentCommerceAPI.addSelection(student.accessToken, Number(projectId));
        setStudent((prev) => ({
          ...prev,
          selectedProjectIds: [...prev.selectedProjectIds, projectId],
        }));
        showToast('Project added to Selected Projects (eligible for a 5-min guidance meeting).', 'success');
      }
    } catch (error) {
      if (error instanceof VerificationApiError && [401, 403].includes(error.status)) {
        handleStudentSessionExpired();
      } else {
        showToast(error instanceof Error ? error.message : 'Unable to update your project selection.', 'error');
      }
    }
  };

  const renderHeartCredits = (size: 'sm' | 'md' = 'md') => {
    const isVerified = student.authState === 'verified';
    if (!isVerified) {
      return (
        <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full text-slate-600">
          <Lock className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-600`} />
          <span className="text-xs font-bold text-slate-700">0 / 5 Previews (Locked)</span>
        </div>
      );
    }
    const total = student.previewStats?.totalAllowed || 5;
    const remaining = student.previewStats?.remainingPreviews ?? 5;
    return (
      <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full">
        <div className="flex items-center gap-1" title={`${remaining} of ${total} PPT preview credits remaining`}>
          {Array.from({ length: total }).map((_, idx) => {
            const isRemaining = idx < remaining;
            return (
              <Heart
                key={idx}
                className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} transition-transform ${
                  isRemaining ? 'text-rose-500 fill-rose-500 scale-100' : 'text-slate-300 fill-slate-200 scale-90'
                }`}
              />
            );
          })}
        </div>
        <span className="text-xs font-semibold text-rose-800 ml-1">
          {remaining}/{total} Previews Left
        </span>
      </div>
    );
  };

  const renderProjectCard = (project: ProjectDTO) => {
    const isViewed = student.viewedProjectIds.includes(project.id);
    const isSelected = student.selectedProjectIds.includes(project.id);

    return (
      <div
        key={project.id}
        className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group"
      >
        <div className={`h-36 bg-gradient-to-br ${project.genericPatternTheme} p-4 flex flex-col justify-between relative`}>
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-white/90 text-slate-900 rounded-full shadow-sm">
              {project.projectType}
            </span>
            <span className="px-2.5 py-0.5 text-xs font-medium bg-black/30 text-white backdrop-blur-sm rounded-full">
              {project.difficulty}
            </span>
          </div>
          {project.availability === 'SOLD_OUT' && (
            <span className="absolute right-3 top-12 inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-[11px] font-extrabold tracking-wide text-white shadow-md border border-rose-400">
              <Lock className="h-3 w-3" /> SOLD OUT
            </span>
          )}
          <div className="flex items-center justify-between text-white/90 text-xs">
            <span className="font-mono bg-black/25 px-2 py-0.5 rounded">{project.category}</span>
            {isViewed && (
              <span className="bg-emerald-500/90 text-white px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" /> Previewed
              </span>
            )}
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-indigo-600 transition-colors">
                {project.title}
              </h3>
            </div>
            <p className="text-sm text-slate-600 line-clamp-2 mb-4">
              {project.shortDescription}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {project.technologies.map((tech) => (
                <span
                  key={tech}
                  className="px-2 py-0.5 text-[11px] font-mono font-medium bg-slate-100 text-slate-700 rounded border border-slate-200"
                >
                  {tech}
                </span>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {project.availability === 'SOLD_OUT' ? 'Sold Out' : isSelected ? 'Selected for Meet' : 'Protected Preview'}
              </span>
              <button
                onClick={() => handleViewProject(project.id)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1"
              >
                View Project <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHomePage = () => (
    <div>
      <section className="bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-900 text-white py-16 lg:py-24 px-4">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Verified College & University Student Marketplace
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Explore & Build Ready-to-Learn <span className="text-emerald-400">Academic Projects</span> at Student-Friendly Prices.
            </h1>
            <p className="text-slate-300 text-base sm:text-lg max-w-2xl leading-relaxed">
              Evaluate curated B.Tech, BCA, MCA, and B.Sc capstone projects safely. Unlock watermarked PPT previews with your student ID, book 1-on-1 guidance sessions, and get complete documentation & viva support.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => navigate('explore')}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                Explore Projects <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('how-it-works')}
                className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/15 transition-all"
              >
                How It Works
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10 text-xs sm:text-sm text-slate-300">
              <div>
                <div className="font-bold text-white text-lg">5 ♥ Credits</div>
                <div>Free PPT Previews / 90 Days</div>
              </div>
              <div>
                <div className="font-bold text-white text-lg">1-on-1 Meet</div>
                <div>5-Min Pre-Purchase Guidance</div>
              </div>
              <div>
                <div className="font-bold text-white text-lg">100% Protected</div>
                <div>Zero Code Leaks Publicly</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <span className="text-xs font-mono text-slate-400">STUDENT EVALUATION FLOW</span>
              </div>
              <div className="space-y-3">
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-700/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">1. College ID Verified</div>
                      <div className="text-[11px] text-slate-400">Unlocks 5 Protected Preview Hearts</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">ACTIVE</span>
                </div>
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-700/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">2. Watermarked PPT Preview</div>
                      <div className="text-[11px] text-slate-400">Evaluate abstract & modules safely</div>
                    </div>
                  </div>
                  <div className="flex text-rose-500 text-xs gap-0.5">♥ ♥ ♥ <span className="text-slate-600">♥ ♥</span></div>
                </div>
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-700/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">3. Shortlist Max 3 Projects</div>
                      <div className="text-[11px] text-slate-400">Schedule 5-min Google Meet doubt call</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">3 MAX</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 px-4 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Browse by Academic Domain</h2>
            <p className="text-sm text-slate-600 mt-1">Select your branch specialization to filter relevant projects</p>
          </div>
          <button
            onClick={() => navigate('explore')}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 mt-2 sm:mt-0 inline-flex items-center gap-1"
          >
            View All Domains <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              onClick={() => {
                setSelectedCategory(cat.name);
                navigate('explore');
              }}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-sm transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                {cat.icon}
              </div>
              <div className="font-bold text-slate-900 text-sm">{cat.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{cat.count}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="py-12 px-4 bg-slate-100/70 border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Featured Academic Projects</h2>
              <p className="text-sm text-slate-600 mt-1">
                Curated projects with complete reports & viva guides. Confidential code & pricing are protected on public cards.
              </p>
            </div>
            <button
              onClick={() => navigate('explore')}
              className="mt-3 sm:mt-0 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Explore Full Catalogue
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogueLoading ? (
              <div className="col-span-full rounded-xl border border-slate-200 bg-white p-8">
                <UnikartLoader message="Loading live catalogue from database…" size="md" />
              </div>
            ) : catalogueError ? (
              <div role="alert" className="col-span-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
                {catalogueError}
                <button onClick={() => { setCatalogueLoading(true); void loadPublicCatalogue(); }} className="ml-3 font-semibold underline">Retry</button>
              </div>
            ) : projects.length ? (
              projects.slice(0, 6).map((proj) => renderProjectCard(proj))
            ) : (
              <p className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No projects are currently available.</p>
            )}
          </div>
        </div>
      </section>

      {/* FULLY RESTORED: How the Marketplace Works & Why Choose Us */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How the Marketplace Works</h2>
          <p className="text-sm text-slate-600 mt-2">
            A transparent 7-step journey designed to protect project originality while giving students complete confidence before purchasing.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-4">
          {[
            { step: '1', title: 'Create Account', desc: 'Sign up with your student email.' },
            { step: '2', title: 'Verify Student ID', desc: 'Upload college ID card for review.' },
            { step: '3', title: 'Explore Listings', desc: 'Filter by tech stack & branch.' },
            { step: '4', title: '5 PPT Previews', desc: 'Use ♥ credits to read watermarked slides.' },
            { step: '5', title: 'Select Up to 3', desc: 'Shortlist viewed projects for discussion.' },
            { step: '6', title: '5-Min Google Meet', desc: 'Clarify project scope with a mentor.' },
            { step: '7', title: 'Affordable Purchase', desc: 'Unlock complete deliverables & report.' },
          ].map((item) => (
            <div key={item.step} className="bg-white p-4 rounded-xl border border-slate-200 relative">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mb-3">
                {item.step}
              </span>
              <h3 className="font-bold text-slate-900 text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14 px-4 bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Why Verified Students Choose Us</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { title: 'Budget-Friendly', desc: 'Pocket-friendly student pricing with eligible referral rewards applied automatically by the backend.' },
              { title: 'Verified Access Only', desc: 'Strict college ID verification keeps public plagiarism away.' },
              { title: 'Protected Previews', desc: 'Evaluate 5 watermarked PPTs per 90-day cycle before deciding.' },
              { title: 'Scheduled Guidance', desc: 'Up to three 5-minute 1-on-1 Google Meet slots for shortlisted projects.' },
              { title: 'Dedicated Support', desc: 'Fast ticket resolution for setup, documentation, and delivery.' },
            ].map((benefit) => (
              <div key={benefit.title} className="bg-white/5 border border-white/10 p-5 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-3" />
                <h3 className="font-bold text-sm mb-1.5">{benefit.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderExplorePage = () => {
    const allTechs = Array.from(new Set(projects.flatMap((p) => p.technologies)));
    const allCategories = Array.from(new Set([...CATEGORIES.map((item) => item.name), ...projects.map((project) => project.category)]));
    const allProjectTypes = Array.from(new Set(projects.map((project) => project.projectType)));

    const filtered = projects.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.shortDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.technologies.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesType = selectedType === 'All' || p.projectType === selectedType;
      const matchesDiff = selectedDifficulty === 'All' || p.difficulty === selectedDifficulty;
      const matchesTech = selectedTech === 'All' || p.technologies.includes(selectedTech);
      return matchesSearch && matchesCat && matchesType && matchesDiff && matchesTech;
    });

    return (
      <div className="max-w-7xl mx-auto py-10 px-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Explore Academic Projects</h1>
            <p className="text-sm text-slate-600 mt-1">
              Evaluate project abstracts and technologies. Exact pricing is unlocked inside verified project evaluation.
            </p>
          </div>
          {student.authState === 'verified' && renderHeartCredits()}
        </div>
        {catalogueError && (
          <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>{catalogueError}</span>
            <button onClick={() => { setCatalogueLoading(true); void loadPublicCatalogue(); }} className="font-semibold underline">Retry</button>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, keyword, or technology..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Categories</option>
              {allCategories.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Project Types</option>
              {allProjectTypes.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="All">All Difficulty Levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Tech Filter:
            </span>
            <button
              onClick={() => setSelectedTech('All')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                selectedTech === 'All' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Tech
            </button>
            {allTechs.map((tech) => (
              <button
                key={tech}
                onClick={() => setSelectedTech(tech)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono ${
                  selectedTech === tech ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tech}
              </button>
            ))}
          </div>
        </div>

        {catalogueLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12">
            <UnikartLoader message="Loading live catalogue from database…" size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Search className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">{projects.length ? 'No Matching Projects Found' : 'No Projects Published Yet'}</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              {projects.length
                ? 'No projects match your current filter combination. Try resetting the technology or difficulty filters.'
                : 'No academic projects have been published to the live catalogue yet. Please check back later.'}
            </p>
            {projects.length > 0 && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedType('All');
                  setSelectedDifficulty('All');
                  setSelectedTech('All');
                }}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((proj) => renderProjectCard(proj))}
          </div>
        )}
      </div>
    );
  };

  const renderProjectDetailsPage = () => {
    if (!activeProject) {
      return (
        <div className="max-w-4xl mx-auto py-16 px-4 text-center">
          <div className="bg-white rounded-2xl border border-slate-200 p-12">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Project Not Available</h2>
            <p className="text-sm text-slate-500 mb-6">No project details could be found. It may have been removed from the catalogue.</p>
            <button
              onClick={() => navigate('explore')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
            >
              Back to Explore Projects
            </button>
          </div>
        </div>
      );
    }
    const isViewed = student.viewedProjectIds.includes(activeProject.id);
    const isSelected = student.selectedProjectIds.includes(activeProject.id);

    return (
      <div className="max-w-5xl mx-auto py-10 px-4">
        <button
          onClick={() => navigate('explore')}
          className="text-xs font-semibold text-slate-600 hover:text-indigo-600 inline-flex items-center gap-1 mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Project Catalogue
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className={`bg-gradient-to-r ${activeProject.genericPatternTheme} p-6 sm:p-8 text-white`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
                {activeProject.category}
              </span>
              <span className="px-3 py-1 bg-black/25 rounded-full text-xs font-medium">
                {activeProject.projectType}
              </span>
              <span className="px-3 py-1 bg-black/25 rounded-full text-xs font-medium">
                Difficulty: {activeProject.difficulty}
              </span>
              {activeProject.availability === 'SOLD_OUT' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-extrabold text-white shadow-sm border border-rose-400">
                  <Lock className="h-3.5 w-3.5" /> SOLD OUT
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">{activeProject.title}</h1>
            <p className="text-white/90 text-sm sm:text-base mt-2 max-w-3xl">
              {activeProject.shortDescription}
            </p>
          </div>

          <div className="p-6 sm:p-8 grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-2">General Problem Statement</h2>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {activeProject.problemStatement}
                </p>
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-900 mb-2">General Feature Categories</h2>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {activeProject.featureCategories.map((feat) => (
                    <div key={feat} className="flex items-center gap-2 text-sm text-slate-700 bg-white border border-slate-200 p-3 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Technologies & Languages</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {activeProject.technologies.map((t) => (
                      <span key={t} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold rounded-md border border-indigo-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Suitable Academic Courses</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {activeProject.suitableBranches.map((b) => (
                      <span key={b} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md border border-slate-200">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-900 mb-2">Available Deliverables (Unlocked Upon Purchase)</h2>
                <ul className="space-y-2">
                  {activeProject.deliverables.map((del) => (
                    <li key={del} className="flex items-center gap-2 text-sm text-slate-700">
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" /> {del}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <strong>Intellectual Property Protection:</strong> To protect student buyers from plagiarism, actual source code, private GitHub links, database schemas, and original Figma UI screenshots are never displayed publicly.
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Evaluation Status
                  </span>
                  {student.authState === 'verified' ? (
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified Student
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                      Verification Required
                    </span>
                  )}
                </div>

                {student.authState === 'verified' ? (
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                    {activeProject.availability === 'SOLD_OUT' ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Lock size={16} /> Sold Out — no new purchases</div>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500">Verified Student Price</div>
                        <div className="text-2xl font-extrabold text-slate-900">
                          ₹{activeProject.price.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                          Includes complete deliverables & report
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 text-xs text-slate-600">
                    Verify your Student ID to unlock project pricing, PPT previews, and meeting slots.
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">Your PPT Preview Credits:</div>
                  {renderHeartCredits('sm')}
                </div>

                {/* MODIFIED: PPT Lock Mechanism */}
                {activeProject.availability === 'SOLD_OUT' ? (
                  <button disabled className="w-full py-2.5 px-4 bg-slate-100 text-slate-500 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200">
                    <Lock className="w-4 h-4" /> Sold Out — Preview Locked
                  </button>
                ) : !activeProject.previewEligible ? (
                  <button disabled className="w-full py-2.5 px-4 bg-slate-100 text-slate-500 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200">
                    <Lock className="w-4 h-4" /> PPT Preview Unavailable
                  </button>
                ) : student.authState === 'verified' ? (
                  <button
                    onClick={() => handleOpenPptPreview(activeProject)}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {isViewed ? 'Re-open PPT Preview (0 Credits)' : 'View PPT Preview (Uses 1 ♥)'}
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-2.5 px-4 bg-slate-200 text-slate-500 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-300"
                  >
                    <Lock className="w-4 h-4" /> Locked: Verify ID to View PPT
                  </button>
                )}

                {isViewed && student.authState === 'verified' && activeProject.availability !== 'SOLD_OUT' && (
                  <button
                    onClick={() => handleToggleSelectProject(activeProject.id)}
                    className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isSelected
                      ? `Selected for Guidance (${student.selectedProjectIds.length}/3)`
                      : `Select for Guidance Meet (${student.selectedProjectIds.length}/3)`}
                  </button>
                )}

                {isSelected && student.authState === 'verified' && (
                  <button
                    onClick={() => navigate('schedule-meet')}
                    className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-4 h-4" /> Schedule 5-Min Google Meet
                  </button>
                )}

                {student.authState === 'verified' && activeProject.availability !== 'SOLD_OUT' && (
                  <button
                    onClick={() => {
                      setCheckoutProjectId(activeProject.id);
                      setCheckoutOrder(null);
                      setCheckoutUtr('');
                      setCheckoutScreenshotFile(null);
                      setCheckoutScreenshotPreview('');
                      setCheckoutScreenshotError('');
                      setAcceptedTerms(false);
                      navigate('checkout');
                    }}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" /> Purchase Project
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPptPreviewPage = () => {
    if (!activeProject) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">No Presentation Available</h1>
          <p className="mt-2 text-sm text-slate-600">Please choose a project from the catalogue to preview slides.</p>
          <button onClick={() => navigate('explore')} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg">
            Back to Explore Projects
          </button>
        </div>
      );
    }
    if (student.authState !== 'verified') {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Lock className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Protected Presentation Preview Locked</h1>
          <p className="mt-2 text-sm text-slate-600">Only verified students can view protected project presentations. Please complete your student ID verification.</p>
        </div>
      );
    }

    const rawPptUrl = (activeProject.ppt_preview_url || activeProject.pptUrl || '').trim();
    const isPdf = rawPptUrl.toLowerCase().includes('.pdf');
    const isPpt = rawPptUrl.toLowerCase().includes('.ppt') || rawPptUrl.toLowerCase().includes('.pptx');

    const iframeSrc = rawPptUrl
      ? isPdf
        ? (rawPptUrl.includes('#') ? rawPptUrl : `${rawPptUrl}#toolbar=0&navpanes=0&scrollbar=0`)
        : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(rawPptUrl)}`
      : '';

    const rawSlides = Array.isArray(activeProject?.pptSlides) && activeProject.pptSlides.length > 0
      ? activeProject.pptSlides
      : [
          {
            slideNumber: 1,
            heading: activeProject?.title || 'Project Presentation Overview',
            bullets: [
              'Comprehensive System Architecture & Implementation',
              'Production-grade Source Code and Deliverables Included',
              'Academic Verification Approved by Unikart'
            ],
            footerNote: 'Unikart Academic Verified Deck'
          },
          {
            slideNumber: 2,
            heading: 'Core Objectives & System Scope',
            bullets: [
              activeProject?.problemStatement || 'Problem Statement Overview',
              activeProject?.shortDescription || 'Key Functional Deliverables',
              'IEEE Standard Report & Presentation Ready'
            ],
            footerNote: 'System Architecture & Implementation Scope'
          },
          {
            slideNumber: 3,
            heading: 'Technology Stack & Modules',
            bullets: [
              `Core Technologies: ${activeProject?.technologies?.join(', ') || 'Modern Full-Stack Architecture'}`,
              `Target Specialization: ${activeProject?.category || 'Major Project'}`,
              'Complete Step-by-Step Viva & Defense Preparation Included'
            ],
            footerNote: 'Tech Stack Specifications'
          }
        ];

    const slides = rawSlides.map((slide: any, idx: number) => {
      const bullets = Array.isArray(slide?.bullets)
        ? slide.bullets
        : Array.isArray(slide?.bulletPoints)
        ? slide.bulletPoints
        : [];
      const heading = slide?.heading || slide?.title || `Slide ${idx + 1}: Overview`;
      const footerNote = slide?.footerNote || `Slide ${idx + 1} of ${rawSlides.length} • Confidential`;
      return {
        slideNumber: slide?.slideNumber ?? idx + 1,
        heading,
        bullets,
        footerNote
      };
    });

    const safeIndex = Math.min(Math.max(0, currentSlideIndex), Math.max(0, slides.length - 1));
    const currentSlide = slides[safeIndex] || {
      slideNumber: 1,
      heading: activeProject?.title || 'Presentation Preview',
      bullets: ['Preview slide ready for verified student evaluation'],
      footerNote: 'Protected Preview'
    };

    const showEmbeddedViewer = Boolean(rawPptUrl) && pptViewMode === 'embedded';

    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                Protected PPT Document Viewer
              </span>
              {rawPptUrl && (
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  {isPdf ? 'PDF Deck' : isPpt ? 'PowerPoint Presentation' : 'Presentation File'}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-0.5">{activeProject.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {renderHeartCredits('sm')}
            {rawPptUrl && (
              <button
                onClick={() => setPptViewMode((prev) => (prev === 'embedded' ? 'slides' : 'embedded'))}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                {pptViewMode === 'embedded' ? (
                  <>
                    <Layers className="w-3.5 h-3.5" /> Structured Slides
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Embedded Document
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => navigate('project-details')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors"
            >
              <X className="w-4 h-4" /> Close Preview
            </button>
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-2.5 rounded-xl text-xs mb-4 flex items-center justify-between flex-wrap gap-2">
          <span>
            <strong>Anti-Piracy Policy:</strong> Watermarked strictly for <strong>{student.fullName} ({student.id})</strong>. Original PPT download, printing, and source code extraction are disabled.
          </span>
          <span className="font-mono font-semibold">Reset Date: {student.previewStats?.nextResetDate || '90-Day Cycle'}</span>
        </div>

        {showEmbeddedViewer ? (
          <div
            onContextMenu={(e) => e.preventDefault()}
            className="relative w-full rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl select-none"
            style={{ minHeight: '620px' }}
          >
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center select-none overflow-hidden">
              <div className="transform -rotate-12 flex flex-col items-center justify-center opacity-25 p-6 bg-slate-900/40 backdrop-blur-[1px] rounded-2xl border border-white/10 shadow-xl">
                <p className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-widest uppercase text-white text-center drop-shadow">
                  PREVIEW ONLY • {student.fullName} • {student.id}
                </p>
                <p className="text-xs sm:text-sm font-mono text-emerald-400 mt-2 text-center font-bold">
                  {student.collegeName || 'Verified Student'} • {student.email}
                </p>
                <p className="text-[10px] sm:text-xs font-mono text-rose-400 mt-1 uppercase tracking-wider font-semibold">
                  UNIKART CONFIDENTIAL • ANTI-PIRACY PROTECTED
                </p>
              </div>
            </div>

            <iframe
              src={iframeSrc}
              title={`Presentation Preview - ${activeProject.title}`}
              className="w-full h-[620px] border-0 bg-white"
            />
          </div>
        ) : (
          <>
            <div
              onContextMenu={(e) => e.preventDefault()}
              className="bg-slate-900 text-white rounded-2xl border-2 border-slate-700 shadow-2xl p-8 sm:p-14 min-h-[400px] flex flex-col justify-between relative overflow-hidden select-none"
            >
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-15 -rotate-12 select-none">
                <p className="text-2xl sm:text-4xl font-extrabold tracking-widest uppercase text-center">
                  PREVIEW ONLY • {student.fullName} • {student.id}
                </p>
                <p className="text-sm sm:text-lg font-mono text-emerald-400 mt-2 text-center">
                  {student.collegeName || 'Verified Student'} • {student.email}
                </p>
                <p className="text-xs font-mono text-rose-400 mt-1 uppercase tracking-wider">
                  UNIKART CONFIDENTIAL • ANTI-PIRACY PROTECTED
                </p>
              </div>

              <div className="relative z-10">
                <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-6">
                  <span className="text-xs font-mono text-emerald-400">
                    SLIDE {currentSlide.slideNumber} OF {slides.length}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    WATERMARK ID: {student.id}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">
                  {currentSlide.heading}
                </h2>
                <ul className="space-y-4">
                  {currentSlide.bullets.length > 0 ? (
                    currentSlide.bullets.map((bullet: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-slate-200 text-sm sm:text-base">
                        <span className="w-6 h-6 rounded-full bg-indigo-500/30 border border-indigo-400 text-indigo-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400 text-sm italic">
                      No additional bullet notes provided for this slide.
                    </li>
                  )}
                </ul>
              </div>

              <div className="relative z-10 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 mt-8">
                <span>{currentSlide.footerNote}</span>
                <span>Unikart Protected Viewer</span>
              </div>
            </div>

            <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
              <button
                disabled={currentSlideIndex === 0}
                onClick={() => setCurrentSlideIndex((i) => Math.max(0, i - 1))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold rounded-lg inline-flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous Slide
              </button>

              <span className="text-xs font-bold text-slate-700">
                Slide {safeIndex + 1} of {slides.length}
              </span>

              <button
                disabled={safeIndex >= slides.length - 1}
                onClick={() => setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 transition-colors"
              >
                Next Slide <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAuthAndVerificationPage = (mode: 'login' | 'signup' | 'verification') => {
    if (mode === 'verification') {
      return (
        <StudentVerificationPage
          accessToken={student.accessToken}
          student={student}
          onLogin={() => navigate('login')}
          onContinue={() => navigate('dashboard')}
          onSessionExpired={handleStudentSessionExpired}
          onApproved={handleStudentApproved}
        />
      );
    }

    if (mode === 'login') {
      return (
        <StudentLogin
          showToast={showToast}
          onNavigateSignup={() => navigate('signup')}
          onNavigateDashboard={() => navigate('dashboard')}
          onSuccess={({ user, session, studentProfile }) => {
            if (studentProfile) {
              setStudent((prev) => {
                const merged = { ...prev, ...studentProfile, role: 'student' as const };
                const { viewedProjectIds, previewStats } = resolveUserPreviewStats(merged);
                return {
                  ...merged,
                  viewedProjectIds,
                  previewStats,
                };
              });
            }
            navigate('dashboard');
          }}
        />
      );
    }

    if (mode === 'signup') {
      return (
        <StudentSignup
          showToast={showToast}
          referralCode={referralCodeFromUrl}
          onNavigateLogin={() => navigate('login')}
          onNavigateDashboard={() => navigate('dashboard')}
          onSuccess={({ studentProfile }) => {
            if (studentProfile) {
              setStudent((prev) => {
                const merged = { ...prev, ...studentProfile, role: 'student' as const };
                const { viewedProjectIds, previewStats } = resolveUserPreviewStats(merged);
                return {
                  ...merged,
                  viewedProjectIds,
                  previewStats,
                };
              });
            }
            navigate('dashboard');
          }}
        />
      );
    }

    if (mode === 'profile') {
      return (
        <ProfilePage
          student={student}
          onUpdateProfile={(updated) => setStudent((prev) => {
            const merged = { ...prev, ...updated };
            const { viewedProjectIds, previewStats } = resolveUserPreviewStats(merged);
            return {
              ...merged,
              viewedProjectIds,
              previewStats,
            };
          })}
          onNavigateVerification={() => navigate('verification')}
          onNavigateReferrals={() => setShareEarnModalOpen(true)}
          showToast={showToast}
        />
      );
    }

    return null;
  };

  const renderAdminLoginPage = () => (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex justify-center mb-1">
          <TransparentBrandLogo className="h-14 w-auto object-contain" alt="Unikart Administration" />
        </div>
        <div>
          <span className="text-xs font-mono uppercase text-indigo-600">Restricted access</span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Admin Login</h1>
          <p className="text-xs text-slate-600 mt-1">Sign in with your administrator account.</p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-user-id" className="block text-xs font-bold text-slate-700 mb-1">Admin User ID</label>
            <input
              id="admin-user-id"
              type="text"
              autoComplete="username"
              value={adminUserId}
              onChange={(event) => {
                setAdminUserId(event.target.value);
                setAdminLoginMessage('');
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                id="admin-password"
                type={showAdminPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => {
                  setAdminPassword(event.target.value);
                  setAdminLoginMessage('');
                }}
                className="w-full px-3.5 py-2 pr-11 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((visible) => !visible)}
                aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showAdminPassword}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-800"
              >
                {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {adminLoginMessage && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {adminLoginMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={adminSubmitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl"
          >
            {adminSubmitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderAdminChangePasswordPage = () => (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <span className="text-xs font-mono uppercase text-indigo-600">Account security</span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Change your initial password</h1>
          <p className="text-xs text-slate-600 mt-1">Set a new password before opening the Admin Dashboard.</p>
        </div>
        <form onSubmit={handleAdminPasswordChange} className="space-y-4">
          <div>
            <label htmlFor="admin-new-password" className="block text-xs font-bold text-slate-700 mb-1">New password</label>
            <div className="relative">
              <input
                id="admin-new-password"
                type={showNewAdminPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newAdminPassword}
                onChange={(event) => {
                  setNewAdminPassword(event.target.value);
                  setAdminPasswordMessage('');
                }}
                className="w-full px-3.5 py-2 pr-11 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setShowNewAdminPassword((visible) => !visible)}
                aria-label={showNewAdminPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showNewAdminPassword}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-800"
              >
                {showNewAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="admin-confirm-password" className="block text-xs font-bold text-slate-700 mb-1">Confirm new password</label>
            <input
              id="admin-confirm-password"
              type={showNewAdminPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmAdminPassword}
              onChange={(event) => {
                setConfirmAdminPassword(event.target.value);
                setAdminPasswordMessage('');
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          {adminPasswordMessage && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {adminPasswordMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={adminSubmitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl"
          >
            {adminSubmitting ? 'Updating password...' : 'Set password'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (adminSession) {
                setAdminSession({ ...adminSession, mustChangePassword: false });
                navigate('admin');
              }
            }}
            className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            Skip for now &rarr; Go to Admin Dashboard
          </button>
        </form>
      </div>
    </div>
  );

  const renderSelectedProjectsPage = () => {
    const selectedProjects = projects.filter((p) =>
      student.selectedProjectIds.includes(p.id)
    );

    return (
      <div className="max-w-6xl mx-auto py-10 px-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Selected Projects
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Your shortlisted engineering projects (up to 3). Review details, book a 5-minute guidance meeting, or proceed directly to checkout.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-900">
                {selectedProjects.length} / 3 Selected
              </span>
              <button
                type="button"
                onClick={() => navigate('explore')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                + Add More Projects
              </button>
            </div>
          </div>

          {selectedProjects.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50 space-y-3 mt-6">
              <FolderKanban className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="text-base font-bold text-slate-800">No Projects Selected Yet (0/3)</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Explore our engineering project catalogue and select up to 3 projects to book 1-on-1 guidance meetings or proceed with purchase.
              </p>
              <button
                type="button"
                onClick={() => navigate('explore')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                Explore Projects
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selectedProjects.map((project) => {
                const techList = project.technologies || [];
                return (
                  <article
                    key={project.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs hover:border-indigo-200 hover:shadow-md transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {project.projectCode || `PRJ-${project.id}`}
                        </span>
                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                          {project.category}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
                          {project.title}
                        </h3>
                        {project.shortDescription && (
                          <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {project.shortDescription}
                          </p>
                        )}
                      </div>

                      {techList.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {techList.slice(0, 3).map((tech) => (
                            <span key={tech} className="text-[10px] font-medium bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                              {tech}
                            </span>
                          ))}
                          {techList.length > 3 && (
                            <span className="text-[10px] font-medium text-slate-400">
                              +{techList.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-500 font-medium">Price:</span>
                        <span className="font-extrabold text-slate-900 text-sm">
                          ₹{Number(project.price).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('schedule-meet')}
                          className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs"
                        >
                          <Calendar className="w-3.5 h-3.5" /> Book 5-Min Meet &rarr;
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCheckoutProjectId(String(project.id));
                            setCheckoutOrder(null);
                            setCheckoutUtr('');
                            setCheckoutScreenshotFile(null);
                            setCheckoutScreenshotPreview('');
                            setCheckoutScreenshotError('');
                            navigate('checkout');
                          }}
                          className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs"
                        >
                          Proceed to Buy
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleSelectProject(project.id)}
                        className="w-full py-1.5 text-center text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </div>
    );
  };

  const renderScheduleMeetPage = () => {
    return (
      <div className="max-w-6xl mx-auto py-10 px-4">
        <StudentCommercePanel
          view="meetings"
          accessToken={student.accessToken}
          studentId={String(student.id)}
          studentEmail={student.email}
          studentName={student.fullName}
          projects={projects}
          viewedProjectIds={student.viewedProjectIds}
          selectedProjectIds={student.selectedProjectIds}
          onSelectionChange={handleStudentSelectionsLoaded}
          onToggleSelection={handleToggleSelectProject}
          onSessionExpired={handleStudentSessionExpired}
          onLogin={() => navigate('login')}
          onToast={(msg, type) => showToast(msg, type)}
          onMeetingsLoaded={handleMeetingsLoaded}
          onNavigate={(page) => navigate(page as PageRoute)}
          onProceedToBuy={(projectId) => {
            setCheckoutProjectId(String(projectId));
            setCheckoutOrder(null);
            setCheckoutUtr('');
            setCheckoutScreenshotFile(null);
            setCheckoutScreenshotPreview('');
            setCheckoutScreenshotError('');
            navigate('checkout');
          }}
        />
      </div>
    );
  };





  const renderStudentDashboard = () => {
    const studentName = currentStudentName;
    const studentId = currentStudentId;
    const akReferralCode = currentAkReferralCode;
    const college = currentCollege;

    return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 bg-indigo-950 text-white rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Unikart Brand Logo */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <TransparentBrandLogo className="h-9 w-auto object-contain" alt="Unikart" />
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">STUDENT</span>
            </div>

            {/* User Identity Section (Avatar, Name, Student ID, AK Referral Code, Status Badge) */}
            <div className="pb-4 border-b border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-xl flex items-center justify-center shadow-md">
                  {studentName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-base tracking-tight text-white truncate">{studentName}</h2>
                  <p className="text-xs text-indigo-200 truncate">{college}</p>
                </div>
              </div>

              {/* Student Verification Status Badge */}
              <div className="pt-0.5">
                {student.authState === 'verified' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Verified Student
                  </span>
                ) : student.authState === 'verification_pending' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    <Clock className="w-4 h-4 text-amber-300 animate-spin" />
                    Pending Verification
                  </span>
                ) : student.authState === 'verification_rejected' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30">
                    <AlertCircle className="w-4 h-4 text-rose-300" />
                    Action Required
                  </span>
                ) : student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30">
                    <AlertCircle className="w-4 h-4 text-rose-300" />
                    Account Restricted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    <AlertCircle className="w-4 h-4 text-amber-300" />
                    Not Verified
                  </span>
                )}
              </div>

              {/* Student ID & AK Referral Code Badges */}
              <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">Student ID</div>
                  <div className="font-mono font-extrabold text-white tracking-wide truncate mt-0.5">{studentId}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase font-bold text-indigo-300 tracking-wider">AK Referral Code</div>
                  <div className="font-mono font-extrabold text-emerald-300 tracking-wider truncate mt-0.5">{akReferralCode}</div>
                </div>
              </div>
            </div>

            <nav className="space-y-1">
              {[
                { id: 'overview', label: 'Profile & Preview Stats', icon: <UserCheck className="w-4 h-4" /> },
                { id: 'activity', label: 'Project Activity', icon: <Layers className="w-4 h-4" /> },
                { id: 'meetings', label: 'Meeting Dashboard', icon: <Calendar className="w-4 h-4" /> },
                { id: 'referrals', label: 'Referral Rewards', icon: <Award className="w-4 h-4" /> },
                { id: 'purchases', label: 'My Purchases & Files', icon: <CreditCard className="w-4 h-4" /> },
                { id: 'support', label: 'Customer Support', icon: <HelpCircle className="w-4 h-4" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDashboardTab(tab.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    dashboardTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-indigo-200 hover:bg-white/5'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="pt-6 border-t border-white/10 mt-6">
            <button
              onClick={async () => {
                let sessionRevoked = !student.accessToken;
                try {
                  await supabase.auth.signOut();
                } catch {
                  /* ignore */
                }
                if (student.accessToken) {
                  try {
                    await StudentAuthAPI.logout(student.accessToken);
                    sessionRevoked = true;
                  } catch (error) {
                    showToast(
                      error instanceof Error ? `Unable to revoke session: ${error.message}` : 'Unable to revoke the student session.',
                      'error'
                    );
                  }
                }
                setStudent({
                  ...INITIAL_STUDENT,
                  authState: 'logged_out',
                  previewStats: {
                    totalAllowed: 5,
                    usedPreviews: 0,
                    remainingPreviews: 5,
                    nextResetDate: '90-Day Cycle'
                  },
                  viewedProjectIds: []
                });
                localStorage.removeItem('cpm_student_session');
                navigate('login');
                if (sessionRevoked) showToast('Logged out successfully.', 'info');
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-6">
          {/* Prominent Verification Rejection Alert Banner at top of dashboard */}
          {student.authState === 'verification_rejected' && (
            <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 shadow-xs animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-amber-950 flex items-center justify-center shrink-0 shadow-xs">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-extrabold text-amber-950">
                        Verification Rejected: {student.rejectionReason || 'Blurry student ID photo'}.
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                        {Math.max(0, 2 - (student.rejectionCount || 1))} re-upload attempt{Math.max(0, 2 - (student.rejectionCount || 1)) === 1 ? '' : 's'} remaining
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 mt-1 max-w-2xl leading-relaxed">
                      Your submitted documents were reviewed by the Unikart administrator. Please re-upload clearer front and back photos of your college ID card (PNG or JPG, max 50 KB each) using the form below to complete verification and unlock PPT previews.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDashboardTab('overview');
                    setTimeout(() => {
                      const el = document.getElementById('student-verification-upload-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
                >
                  <Upload size={14} /> Re-upload ID Cards &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Permanent Verification Restriction Alert Banner at top of dashboard */}
          {(student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2) && (
            <div className="rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 sm:p-5 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-extrabold text-rose-950">
                      Account Restricted from Verification (0 re-upload attempts remaining)
                    </h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-200 text-rose-900 border border-rose-300">
                      Permanent Block (2/2 Attempts Used)
                    </span>
                  </div>
                  <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                    Your submitted ID documents were rejected 2 times. In accordance with Unikart academic verification policy, your account has been permanently restricted from submitting additional verification documents.
                  </p>
                  {student.rejectionReason && (
                    <p className="mt-2 text-xs font-semibold text-rose-900 bg-rose-100/80 p-2.5 rounded-lg border border-rose-200">
                      <strong>Admin Rejection Reason:</strong> {student.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">Preview Credits</div>
              {student.authState === 'verified' ? (
                <>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">
                    {student.previewStats?.remainingPreviews ?? 5} / {student.previewStats?.totalAllowed ?? 5} ♥
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Reset: {student.previewStats?.nextResetDate || '90-Day Cycle'}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-extrabold text-amber-700 mt-1 flex items-center gap-1.5">
                    <Lock size={15} className="text-amber-600" /> 0 / 5 Previews (Locked)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Unlocks on Admin Approval</div>
                </>
              )}
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">Selected Projects</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {student.selectedProjectIds.length} / 3 Max
              </div>
              <div className="text-[11px] text-indigo-600 font-medium mt-1">Eligible for 5-min Meet</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">Guidance Meetings</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {meetings.length} / 3 Booked
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">5 mins per session</div>
            </div>
          </div>

          {dashboardTab === 'overview' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Student Profile Details</h3>
                  <p className="text-xs text-slate-500">Official student identity and academic verification credentials</p>
                </div>
                {renderHeartCredits()}
              </div>

              {/* Profile Details Grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500">Full Name</div>
                  <div className="font-bold text-slate-900 text-base mt-1">{studentName}</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500">College / University</div>
                  <div className="font-bold text-slate-900 text-base mt-1">{college}</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500">Student ID</div>
                  <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">{studentId}</div>
                </div>

                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                  <div className="text-xs font-semibold text-emerald-700">AK Referral Code</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono font-black text-emerald-900 text-lg">{akReferralCode}</span>
                    <button
                      onClick={() => {
                        void copyText(akReferralCode);
                        setCopiedProfileCode(true);
                        setTimeout(() => setCopiedProfileCode(false), 2500);
                        showToast(`AK Referral Code ${akReferralCode} copied!`, 'success');
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                    >
                      {copiedProfileCode ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                      {copiedProfileCode ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500">Verification Status</div>
                  <div className="mt-1">
                    {student.authState === 'verified' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Verified Student
                      </span>
                    ) : student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        Account Restricted
                      </span>
                    ) : student.authState === 'verification_rejected' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        Rejected ({2 - (student.rejectionCount || 1)} Left)
                      </span>
                    ) : student.authState === 'verification_pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                        Pending Verification
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        Not Verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500">Mobile & Email</div>
                  <div className="font-medium text-slate-800 text-xs mt-1 truncate">
                    {student.mobile || '—'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {student.email || '—'}
                  </div>
                </div>
              </div>

              {/* 90-Day Reset Schedule Card */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-indigo-950">90-Day Preview Reset Schedule:</span>{' '}
                  <span className="text-indigo-800">
                    Used: {student.previewStats?.usedPreviews ?? 0} • Remaining: {student.previewStats?.remainingPreviews ?? 5} • Next Reset: {student.previewStats?.nextResetDate || '90-Day Cycle'}
                  </span>
                </div>
                <button
                  onClick={() => setShareEarnModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share & Earn Rewards &rarr;
                </button>
              </div>

              {/* Student Verification Lifecycle: Approved / Blocked / Rejection Warning & Form */}
              {student.authState === 'verified' ? (
                /* 1. Approved State Banner: Form completely hidden, PPT previews unlocked */
                <div className="mt-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-3xl p-6 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-extrabold text-emerald-950">Student ID Verification Approved</h3>
                          <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-extrabold bg-emerald-200 text-emerald-900 border border-emerald-300">
                            <CheckCircle2 size={12} className="text-emerald-700" /> Verified Student
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 mt-1 max-w-xl leading-relaxed">
                          Your student credentials (<strong>{studentId}</strong>) have been officially approved by Unikart administrators. Full academic privileges, all protected project presentation (PPT) previews, and deliverables are unlocked.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('explore')}
                      className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" /> Explore Unlocked PPTs &rarr;
                    </button>
                  </div>
                </div>
              ) : student.authState === 'verification_blocked' || (student.rejectionCount || 0) >= 2 ? (
                /* 2. Permanent Account Block Notice: Form completely hidden */
                <div className="mt-6 bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shrink-0 shadow-md">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-extrabold text-rose-950">Account Restricted from Verification</h3>
                        <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-extrabold bg-rose-200 text-rose-900 border border-rose-300">
                          Permanent Block (2/2 Attempts Used)
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 mt-1.5 leading-relaxed">
                        Your submitted ID documents were rejected 2 times. In accordance with Unikart academic verification policy, your account has been permanently restricted from submitting additional verification documents.
                      </p>
                      {student.rejectionReason && (
                        <div className="mt-3 p-3 rounded-xl bg-rose-100/80 border border-rose-200 text-xs text-rose-950">
                          <strong>Latest Admin Feedback:</strong> {student.rejectionReason}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <a
                          href="mailto:support@unikart.com?subject=Verification%20Restriction%20Inquiry%20-%20STU-2026-0001"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                        >
                          Contact Academic Support &rarr;
                        </a>
                        <span className="text-[11px] text-rose-600 font-medium">
                          Student ID: {studentId} • AK Referral Code: {akReferralCode}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* 3. Upload Form with Rejection Warning Banner (if rejected and remaining attempts > 0) */
                <div id="student-verification-upload-section" className="mt-6 bg-amber-50/80 border border-amber-200 rounded-3xl p-6 shadow-xs">
                  {/* Rejection Warning Banner */}
                  {student.authState === 'verification_rejected' && (
                    <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-100/70 p-4 shadow-xs">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-300 flex items-center justify-center text-amber-900 shrink-0">
                          <AlertTriangle className="w-5 h-5 text-amber-800" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-amber-950">
                              Verification rejected. You have {2 - (student.rejectionCount || 1)} re-upload attempt remaining before account restriction.
                            </h4>
                          </div>
                          <p className="text-xs text-amber-900 mt-1">
                            Please ensure your document is clearly legible, shows your full name matching your profile, and is within the 50 KB PNG/JPG file limit.
                          </p>
                          {student.rejectionReason && (
                            <p className="mt-2 text-xs font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                              <strong>Admin Reason:</strong> {student.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
                  <p className="text-xs text-amber-800 mb-5">
                    Please upload clear images of the front and back of your valid college/university ID card. Strictly PNG or JPG format (maximum 50 KB each). Without verification, PPT previews are locked.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Front Side Card */}
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

                    {/* Back Side Card */}
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
                    onClick={handleSubmitStudentVerification}
                    className="mt-5 w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-amber-950 text-sm font-bold rounded-2xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    {idCardSubmitting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" /> Submitting Documents for Verification...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} /> {student.authState === 'verification_rejected' ? 'Resubmit Corrected ID Documents' : 'Submit Documents for Verification'}
                      </>
                    )}
                  </button>
                  {student.authState === 'verification_pending' && (
                    <p className="mt-2.5 text-center text-xs text-amber-900 font-medium">
                      {(student.rejectionCount || 0) > 0
                        ? '⚡ Your corrected documents have been re-submitted with Priority #1 ranking in the Unikart administrator queue. Obsolete previous files have been purged.'
                        : '✓ Your documents have been submitted to the Unikart administrator queue. Status will update automatically once verified.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {dashboardTab === 'activity' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Previously Viewed & Selected Projects</h3>
                <button
                  onClick={() => navigate('selected-projects')}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Manage Selection & Meetings →
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {projects
                  .filter((p) => student.viewedProjectIds.includes(p.id))
                  .map((p) => (
                    <div key={p.id} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-slate-900">{p.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{p.category} • {p.projectType}</div>
                      </div>
                      <button
                        onClick={() => handleViewProject(p.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg"
                      >
                        Open
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {dashboardTab === 'meetings' && (
            <StudentCommercePanel
              view="meetings"
              accessToken={student.accessToken}
              studentId={String(student.id)}
              studentEmail={student.email}
              studentName={student.fullName}
              projects={projects}
              selectedProjectIds={student.selectedProjectIds}
              onSelectionChange={handleStudentSelectionsLoaded}
              onToggleSelection={handleToggleSelectProject}
              onSessionExpired={handleStudentSessionExpired}
              onLogin={() => navigate('login')}
              onToast={(msg, type) => showToast(msg, type)}
              onMeetingsLoaded={handleMeetingsLoaded}
              onNavigate={(page) => navigate(page as PageRoute)}
              onProceedToBuy={(projectId) => {
                setCheckoutProjectId(String(projectId));
                setCheckoutOrder(null);
                setCheckoutUtr('');
                setCheckoutScreenshotFile(null);
                setCheckoutScreenshotPreview('');
                setCheckoutScreenshotError('');
                navigate('checkout');
              }}
            />
          )}

          {dashboardTab === 'referrals' && renderReferralSection()}

          {dashboardTab === 'purchases' && (
            <StudentCommercePanel
              view="orders"
              accessToken={student.accessToken}
              studentId={student.id}
              studentEmail={student.email}
              studentName={student.fullName}
              projects={projects}
              onSessionExpired={handleStudentSessionExpired}
              onLogin={() => navigate('login')}
              onToast={(msg, type) => showToast(msg, type)}
            />
          )}

          {dashboardTab === 'support' && renderSupportSection()}
        </div>
      </div>
    </div>
    );
  };

  const renderReferralSection = () => (
    <StudentReferralPage
      accessToken={student.accessToken}
      onSessionExpired={handleStudentSessionExpired}
      onLogin={() => navigate('login')}
      studentId={currentStudentId}
      studentName={currentStudentName}
      studentMobile={student.mobile || '7004273758'}
      referralCode={currentAkReferralCode}
      onToast={(msg, type) => showToast(msg, type)}
    />
  );

  const renderCheckoutPage = () => {
    if (!checkoutProject) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">No Project Selected</h1>
          <p className="mt-2 text-sm text-slate-600">Please choose a project from the catalogue to proceed with booking.</p>
          <button onClick={() => navigate('explore')} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Back to Catalogue</button>
        </div>
      );
    }
    if (checkoutProject.availability === 'SOLD_OUT') {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Lock className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Project Sold Out</h1>
          <p className="mt-2 text-sm text-slate-600">This project is no longer available for new purchases.</p>
          <button onClick={() => navigate('explore')} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Back to Catalogue</button>
        </div>
      );
    }
    const finalPayable = checkoutProject.price;

    const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      setCheckoutScreenshotError('');
      if (!file) {
        setCheckoutScreenshotFile(null);
        setCheckoutScreenshotPreview('');
        return;
      }
      const validMimes = ['image/png', 'image/jpeg', 'image/jpg'];
      const validExts = /\.(png|jpe?g)$/i;
      if (!validMimes.includes(file.type.toLowerCase()) && !validExts.test(file.name)) {
        setCheckoutScreenshotError('Only PNG or JPG image files are accepted.');
        setCheckoutScreenshotFile(null);
        setCheckoutScreenshotPreview('');
        return;
      }
      if (file.size > 50 * 1024) {
        setCheckoutScreenshotError(`File size (${(file.size / 1024).toFixed(1)} KB) exceeds the strict 50 KB limit. Please compress or take a smaller screenshot.`);
        setCheckoutScreenshotFile(null);
        setCheckoutScreenshotPreview('');
        return;
      }
      setCheckoutScreenshotFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setCheckoutScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    const handleCopyUpi = () => {
      navigator.clipboard.writeText('unikart@upi');
      setCheckoutUpiCopied(true);
      showToast('Merchant UPI ID copied: unikart@upi', 'success');
      setTimeout(() => setCheckoutUpiCopied(false), 2000);
    };

    const submitPaymentOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!student.accessToken && !student.id && !student.email) {
        showToast('Please sign in to complete your project purchase.', 'error');
        navigate('login');
        return;
      }

      const cleanUtr = checkoutUtr.trim();
      if (!/^\d{12}$/.test(cleanUtr)) {
        showToast('Please enter a valid 12-digit numeric Bank Reference (UTR) number.', 'error');
        return;
      }
      if (!checkoutScreenshotPreview) {
        showToast('Please upload your payment confirmation screenshot (≤ 50 KB).', 'error');
        return;
      }
      if (!acceptedTerms) {
        showToast('Please accept the Terms & Conditions and Refund Policy.', 'error');
        return;
      }

      setOrderSubmitting(true);
      try {
        const randomInv = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const projectIdNum = Number(checkoutProject.id) || 1;

        const order = await StudentCommerceAPI.submitOrderPayment({
          user_id: String(student.id || student.email || 'student'),
          student_id: String(student.id || 'STU-VERIFIED'),
          student_name: student.fullName || 'Verified Student',
          student_email: student.email || '',
          project_id: String(checkoutProject.id),
          project_title: checkoutProject.title,
          amount: checkoutProject.price,
          utr_number: cleanUtr,
          payment_screenshot_url: checkoutScreenshotPreview,
          invoice_number: randomInv
        });

        setCheckoutOrder(order);
        showToast(`Payment submitted successfully! Invoice: ${order.invoice_number}`, 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to submit payment order to database.', 'error');
      } finally {
        setOrderSubmitting(false);
      }
    };

    if (checkoutOrder) {
      return (
        <div className="max-w-2xl mx-auto py-12 px-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                Payment Under Verification by Admin
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900">Payment Submitted for Audit</h1>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Thank you! We received your payment proof for <strong>{checkoutOrder.project_title}</strong>. Our finance desk verifies UTR payments within <strong>15–30 minutes</strong>.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Invoice Number:</span>
                <span className="font-mono font-bold text-slate-900">{checkoutOrder.invoice_number || `INV-2026-${checkoutOrder.id}`}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Bank Reference / UTR:</span>
                <span className="font-mono font-bold text-indigo-700">{checkoutOrder.utr_number}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-extrabold text-slate-900 text-sm">₹{checkoutOrder.amount}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-amber-700">Awaiting Admin Verification</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setDashboardTab('purchases');
                  navigate('dashboard');
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Go to My Orders &amp; Invoices
              </button>
              <button
                onClick={() => navigate('explore')}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Explore More Projects
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8">
          <div className="border-b border-slate-200 pb-5">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Verified Student Checkout · Step 9 &amp; 10</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{checkoutProject.title}</h1>
            <p className="text-xs text-slate-500 mt-1">Official Academic Project Licensing &amp; Full Codebase Package</p>
          </div>

          <div className="grid md:grid-cols-12 gap-8">
            <div className="md:col-span-5 space-y-5">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Included Deliverables</h3>
                <ul className="space-y-2 text-xs text-slate-600">
                  {checkoutProject.deliverables.map((d) => (
                    <li key={d} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Complete Unwatermarked PPT Presentation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Full Source Code ZIP with Setup Guide</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-3">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Catalogue Price:</span>
                  <span className="font-semibold text-slate-800">₹{checkoutProject.price}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Student Verification Subsidy:</span>
                  <span className="font-semibold text-emerald-700">Included</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-slate-900 pt-3 border-t border-indigo-200/60">
                  <span>Total Payable:</span>
                  <span className="text-emerald-700 text-lg">₹{finalPayable}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Verified Direct UPI Transfer · Protected by Unikart Student Guarantee</span>
              </div>
            </div>

            <div className="md:col-span-7 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Official Merchant UPI</h3>
                    <p className="text-[11px] text-slate-500">Scan QR or transfer directly to the UPI ID</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    Active
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-white rounded-xl border border-slate-200">
                  <div className="flex flex-col items-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`upi://pay?pa=unikart@upi&pn=Unikart%20Marketplace&am=${finalPayable}&cu=INR`)}`}
                      alt="Scan to Pay via UPI"
                      className="w-36 h-36 rounded-lg border border-slate-100 shadow-sm"
                    />
                    <span className="text-[10px] font-bold text-slate-600 mt-1.5">Scan with any UPI App</span>
                  </div>

                  <div className="space-y-2.5 text-xs flex-1 text-center sm:text-left">
                    <div>
                      <span className="text-slate-500 text-[11px] block">UPI ID / VPA:</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-slate-100 px-2.5 py-1.5 rounded-lg font-mono font-bold text-slate-900 border border-slate-200 text-xs">
                          unikart@upi
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyUpi}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Copy size={13} /> {checkoutUpiCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Merchant Name:</span>
                      <strong className="text-slate-900">Unikart Marketplace</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Exact Payable Amount:</span>
                      <strong className="text-emerald-700 font-extrabold">₹{finalPayable}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={submitPaymentOrder} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    12-Digit Bank / UPI Reference (UTR) Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={checkoutUtr}
                    onChange={(e) => setCheckoutUtr(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 412356789012"
                    className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 tracking-wider"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Enter the 12-digit transaction/UTR number shown in Google Pay, PhonePe, Paytm, or your bank app.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Payment Screenshot Proof <span className="text-rose-500">*</span>
                    <span className="text-slate-500 font-normal ml-1">(Strictly ≤ 50 KB, PNG or JPG)</span>
                  </label>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    required
                    onChange={handleScreenshotChange}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />

                  {checkoutScreenshotError && (
                    <p className="mt-1.5 text-xs text-rose-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} /> {checkoutScreenshotError}
                    </p>
                  )}

                  {checkoutScreenshotPreview && (
                    <div className="mt-3 flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <img
                        src={checkoutScreenshotPreview}
                        alt="Screenshot Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-slate-300"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-slate-800">{checkoutScreenshotFile?.name}</p>
                        <p className="text-[11px] text-emerald-700 font-medium">
                          Size: {checkoutScreenshotFile ? (checkoutScreenshotFile.size / 1024).toFixed(1) : 0} KB (Within 50 KB limit ✓)
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <span>
                    I accept the <button type="button" onClick={() => navigate('terms')} className="text-indigo-600 underline">Terms of Service</button> and <button type="button" onClick={() => navigate('refund')} className="text-indigo-600 underline">Refund Policy</button>. All project assets are licensed digitally for academic learning and reference.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={orderSubmitting || !acceptedTerms || !/^\d{12}$/.test(checkoutUtr.trim()) || !checkoutScreenshotPreview}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  {orderSubmitting ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" /> Submitting Payment to Database…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Submit Payment for Verification (₹{finalPayable})
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFormattedSupportText = (text: string) => {
    const parts = text.split(/(\*\*`?[^`*]+`?\*\*|`[^`]+`)/g);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            let inner = part.slice(2, -2);
            const isCode = inner.startsWith('`') && inner.endsWith('`');
            if (isCode) inner = inner.slice(1, -1);
            return (
              <strong
                key={i}
                className={`font-bold ${isCode ? 'font-mono text-indigo-700 bg-indigo-100/70 px-1 py-0.5 rounded' : 'text-slate-900'}`}
              >
                {inner}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={i} className="font-mono font-semibold text-indigo-700 bg-indigo-100/70 px-1 py-0.5 rounded">
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  const renderSupportSection = () => {
    const handleTriggerSupportQuestion = (qId: string) => {
      setSelectedSupportQId(qId);
      const preset = SUPPORT_PRESET_QUESTIONS.find((q) => q.id === qId) || SUPPORT_PRESET_QUESTIONS[0];
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[now.getMonth()];
      const year = now.getFullYear();
      const submissionDate = `${day} ${month} ${year}`;

      const newTicket: SupportTicket = {
        ticketId: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
        category: preset.category,
        subject: preset.question,
        description: preset.question,
        submissionDate,
        status: 'Resolved',
        autoReply: preset.answer,
      };

      setTickets((prev) => {
        const updated = [newTicket, ...prev];
        try {
          localStorage.setItem('cpm_support_tickets', JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });

      setLatestSubmittedTicket(newTicket);
      showToast(`Instant answer loaded for: "${preset.question}"`, 'success');
    };

    return (
      <div className="max-w-5xl mx-auto py-8 px-4 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Instant Support & Auto-Help Desk</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Choose any question below for a guaranteed instant auto-answer. No waiting required.
            </p>

            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-indigo-950 block">Official Support Desk</span>
                <a href={`mailto:${SUPPORT_OFFICIAL_EMAIL}`} className="font-mono text-indigo-600 hover:underline font-bold">
                  {SUPPORT_OFFICIAL_EMAIL}
                </a>
              </div>
              <a
                href={`mailto:${SUPPORT_OFFICIAL_EMAIL}?subject=Support%20Inquiry%20from%20Student`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-[11px] transition shadow-xs shrink-0"
              >
                <Mail className="w-3 h-3" /> Email Admin
              </a>
            </div>

            {/* Select Your Support Question Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Select Your Support Question</label>
              <select
                value={selectedSupportQId}
                onChange={(e) => handleTriggerSupportQuestion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-indigo-200 bg-white font-semibold text-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                {SUPPORT_PRESET_QUESTIONS.map((q, idx) => (
                  <option key={q.id} value={q.id}>
                    {idx + 1}. {q.question}
                  </option>
                ))}
              </select>
            </div>

            {/* Clickable Question Cards */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Or Click A Question Card:</p>
              <div className="space-y-1.5">
                {SUPPORT_PRESET_QUESTIONS.map((q, idx) => {
                  const isSelected = selectedSupportQId === q.id && latestSubmittedTicket?.subject === q.question;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleTriggerSupportQuestion(q.id)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950 font-bold shadow-2xs ring-1 ring-indigo-400'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="truncate">{q.question}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-500 shrink-0 font-medium">
                        {q.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Get Instant Answer Button */}
            <button
              type="button"
              onClick={() => handleTriggerSupportQuestion(selectedSupportQId)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Get Instant Answer
            </button>
          </div>

          {/* Dedicated Other / Custom Query Card */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/90 to-blue-50/60 border border-indigo-200 rounded-2xl shadow-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-600 shrink-0" />
              <h3 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wide">
                Other / Custom Query? Email Support Directly
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Have a unique question not listed above? Send an email directly to our official support desk at{' '}
              <strong className="text-indigo-900 font-mono">marketplacep6@gmail.com</strong> with your Student ID and inquiry details.
            </p>
            <a
              href={`mailto:${SUPPORT_OFFICIAL_EMAIL}?subject=${encodeURIComponent(
                `Custom Support Inquiry from Student - ${student.fullName || 'Student'} (${student.id})`
              )}&body=${encodeURIComponent(
                `Student Name: ${student.fullName}\nStudent ID: ${student.id}\nCollege: ${student.collegeName}\n\nMy Question / Query:\n`
              )}`}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <Mail className="w-3.5 h-3.5" /> Email {SUPPORT_OFFICIAL_EMAIL}
            </a>
          </div>

          {/* Instant Auto-Support Answer Confirmation Banner */}
          {latestSubmittedTicket && (
            <div className="p-4 rounded-2xl border-2 border-indigo-300 bg-indigo-50/90 shadow-sm animate-in fade-in duration-200 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wide">
                    Instant Auto-Support Answer (#{latestSubmittedTicket.ticketId})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setLatestSubmittedTicket(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="text-indigo-600 font-extrabold">Q:</span>
                <span>{latestSubmittedTicket.subject}</span>
              </div>

              <div className="text-xs text-slate-800 leading-relaxed bg-white p-3.5 rounded-xl border border-indigo-100 shadow-xs">
                <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Guaranteed Answer:
                </div>
                {renderFormattedSupportText(
                  latestSubmittedTicket.autoReply || getPresetAnswer(latestSubmittedTicket.subject)
                )}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-indigo-200/60">
                <div className="text-[11px] text-slate-600">
                  Official Support: <span className="font-mono font-bold text-indigo-900">{SUPPORT_OFFICIAL_EMAIL}</span>
                </div>
                <a
                  href={`mailto:${SUPPORT_OFFICIAL_EMAIL}?subject=${encodeURIComponent(
                    `[${latestSubmittedTicket.ticketId}] ${latestSubmittedTicket.subject}`
                  )}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
                >
                  <Mail className="w-3.5 h-3.5" /> Email Admin
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Ticket History</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}
            </span>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">No support tickets submitted yet</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Select a question on the left to receive an instant auto-answer.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((t) => {
                const matchedReply = t.autoReply || getPresetAnswer(t.subject);
                return (
                  <div key={t.ticketId} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="font-mono font-bold text-indigo-600">{t.ticketId}</span>
                          <span className="text-slate-300">•</span>
                          <span className="font-semibold text-slate-700">{t.category}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">{t.submissionDate}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm mt-1">{t.subject}</h3>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                          t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    {/* Admin Auto-Reply Box */}
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                        <Bot className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span>Admin Auto-Reply</span>
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed">
                        {renderFormattedSupportText(matchedReply)}
                      </div>
                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500">
                          Official Support: <span className="font-mono text-slate-700 font-semibold">{SUPPORT_OFFICIAL_EMAIL}</span>
                        </span>
                        <a
                          href={`mailto:${SUPPORT_OFFICIAL_EMAIL}?subject=${encodeURIComponent(`[${t.ticketId}] ${t.subject}`)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition shadow-2xs"
                        >
                          <Mail className="w-3.5 h-3.5" /> Email Admin
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAdminPanel = (initialSection?: any) => {
    if (!adminSession) return renderAdminLoginPage();
    if (adminSession.mustChangePassword) return renderAdminChangePasswordPage();

    return (
      <AdminDashboard
        accessToken={adminSession.accessToken}
        onLogout={handleAdminLogout}
        onSessionExpired={handleAdminSessionExpired}
        initialSection={initialSection || (currentRoute === 'mentor' ? 'mentor' : 'overview')}
        onNavigate={navigate}
      />
    );
  };

  const renderLegalPage = (type: 'privacy' | 'terms' | 'refund') => (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
        <span className="text-xs font-mono uppercase text-indigo-600">Platform Legal Information</span>
        <h1 className="text-2xl font-bold text-slate-900">
          {type === 'privacy' && 'Privacy Policy & Student ID Data Protection'}
          {type === 'terms' && 'Terms and Conditions of Use'}
          {type === 'refund' && 'Cancellation & Refund Policy'}
        </h1>
        <p className="text-xs text-slate-500">
          Note: Placeholder structure implemented per Section 15. Final legal text to be supplied by the platform owner.
        </p>
        <div className="space-y-3 text-sm text-slate-700 leading-relaxed pt-2 border-t border-slate-100">
          {type === 'privacy' && (
            <>
              <p><strong>1. Personal Information & Student ID Verification:</strong> We collect your name, mobile number, college name, and student ID document solely to verify student eligibility.</p>
              <p><strong>2. Strict Document Confidentiality:</strong> Uploaded student ID cards are never displayed on public profiles or project pages and are restricted to authorized verification staff.</p>
            </>
          )}
          {type === 'terms' && (
            <>
              <p><strong>1. Preview Usage Limits:</strong> Verified students receive 5 watermarked PPT preview credits per 90-day cycle.</p>
              <p><strong>2. Meeting Rules:</strong> Students may shortlist up to 3 previewed projects and book up to three 5-minute scheduled Google Meet guidance sessions.</p>
              <p><strong>3. Referral Rewards:</strong> Eligible successful referrals earn an authenticated backend reward after a qualifying paid purchase is confirmed.</p>
            </>
          )}
          {type === 'refund' && (
            <>
              <p><strong>1. Pre-Purchase Evaluation:</strong> Because students evaluate watermarked PPT previews and attend a 1-on-1 guidance meeting before purchasing, digital source code deliverables are non-refundable once downloaded, except where deliverables fail to match the listed specification.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (appBootLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <UnikartLoader message="Initializing Unikart..." size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] max-w-sm bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

      {/* Share & Earn Modal */}
      {shareEarnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setShareEarnModalOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            aria-label="Close Share and Earn modal"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white relative">
              <button
                onClick={() => setShareEarnModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 text-xs font-bold mb-3 border border-emerald-400/30">
                <Sparkles className="w-3.5 h-3.5" /> Unikart Rewards Program
              </div>
              <h3 className="text-xl font-extrabold tracking-tight">Share & Earn Rewards</h3>
              <p className="text-xs text-indigo-200 mt-1 max-w-md">
                Invite fellow classmates and students to Unikart. Earn real cash rewards for each verified friend who joins and purchases a project across 4 referral tiers.
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* AK Referral Code Box */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Your AK Referral Code</span>
                  <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Permanent Code
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="font-mono text-2xl font-black text-indigo-950 tracking-wider">
                    {currentAkReferralCode}
                  </span>
                  <button
                    onClick={() => {
                      void copyText(currentAkReferralCode);
                      setCopiedModalCode(true);
                      setTimeout(() => setCopiedModalCode(false), 2500);
                      showToast(`AK Referral Code ${currentAkReferralCode} copied!`, 'success');
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                  >
                    {copiedModalCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    {copiedModalCode ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>

              {/* Referral Link Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">Personal Referral Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={currentReferralLink}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      void copyText(currentReferralLink);
                      setCopiedModalLink(true);
                      setTimeout(() => setCopiedModalLink(false), 2500);
                      showToast('Referral link copied to clipboard!', 'success');
                    }}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors flex items-center gap-1"
                    title="Copy Link"
                  >
                    {copiedModalLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span className="text-xs font-bold">{copiedModalLink ? 'Copied!' : ''}</span>
                  </button>
                </div>
              </div>

              {/* Share Actions */}
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: 'Join Unikart with my code ' + currentAkReferralCode,
                          text: `Explore verified college projects on Unikart! Use my AK Referral Code ${currentAkReferralCode} to get started:`,
                          url: currentReferralLink
                        });
                        showToast('Referral link shared successfully!', 'success');
                      } catch (err) {
                        if (err instanceof DOMException && err.name === 'AbortError') return;
                        void copyText(currentReferralLink);
                        showToast('Referral link copied to clipboard!', 'info');
                      }
                    } else {
                      void copyText(currentReferralLink);
                      showToast('Native sharing not supported here. Referral link copied!', 'info');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors"
                >
                  <Share2 className="w-4 h-4" /> Share via WhatsApp / Social
                </button>

                <div className="text-center pt-2">
                  <button
                    onClick={() => {
                      setShareEarnModalOpen(false);
                      setDashboardTab('referrals');
                      navigate('dashboard');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    View detailed Referral Rewards (Levels 1–4) & Payout History &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clean White Navigation Drawer (Mobile) */}
      {currentRoute !== 'admin' && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            aria-label="Close navigation"
          />
          {/* White Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-white text-slate-900 p-6 flex flex-col justify-between z-10 shadow-2xl h-full border-r border-slate-200 overflow-y-auto">
            <div className="space-y-6">
              {/* Drawer Header & Branding */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <button onClick={() => navigate('home')} className="flex items-center gap-2 text-left">
                  <TransparentBrandLogo className="h-10 w-auto object-contain" alt="Unikart" />
                </button>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Heart Credits indicator */}
              <div className="pb-2">
                {renderHeartCredits('sm')}
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5 text-xs font-semibold text-slate-700">
                <button
                  onClick={() => navigate('home')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'home'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                  <span>Home</span>
                </button>

                <button
                  onClick={() => navigate('explore')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'explore'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Search className="w-4 h-4 text-emerald-500" />
                  <span>Explore Projects</span>
                </button>

                <button
                  onClick={() => navigate('selected-projects')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'selected-projects'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-500" />
                  <span>Selected Projects ({student.selectedProjectIds.length}/3)</span>
                </button>

                <button
                  onClick={() => navigate('schedule-meet')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'schedule-meet'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-violet-500" />
                  <span>Schedule 5-Min Meet</span>
                </button>

                <button
                  onClick={() => navigate('dashboard')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'dashboard'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-cyan-500" />
                  <span>Student Profile Dashboard</span>
                </button>

                <button
                  onClick={() => navigate('support')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'support'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <HelpCircle className="w-4 h-4 text-sky-500" />
                  <span>Customer Support</span>
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShareEarnModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors text-left hover:bg-emerald-50 text-slate-700 hover:text-emerald-700"
                >
                  <div className="flex items-center gap-3">
                    <Share2 className="w-4 h-4 text-emerald-500" />
                    <span className="font-semibold">Share & Earn</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Rewards
                  </span>
                </button>

                <button
                  onClick={() => navigate('verification')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    currentRoute === 'verification'
                      ? 'bg-indigo-50 text-indigo-600 font-bold'
                      : 'hover:bg-slate-50 text-indigo-600 font-bold'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Student ID Verification</span>
                </button>

              </nav>
            </div>

            {/* Bottom Auth Section */}
            <div className="pt-4 border-t border-slate-100">
              {student.authState === 'logged_out' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate('login')}
                    className="w-full py-2.5 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => navigate('signup')}
                    className="w-full py-2.5 text-center text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs"
                  >
                    Sign Up
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => navigate('dashboard')}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                      {student.fullName.charAt(0)}
                    </span>
                    <span className="text-xs font-bold text-slate-800">{student.fullName || 'Student'}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-600">View Profile &rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* A. Navigation Bar */}
      <header className={(currentRoute === 'admin' || currentRoute === 'mentor') ? 'hidden' : 'bg-white border-b border-slate-200 sticky top-0 z-40'}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('home')} className="flex items-center gap-2 text-left">
              <TransparentBrandLogo className="h-10 sm:h-11 w-auto object-contain" alt="Unikart" />
            </button>

            <nav className="hidden md:flex items-center gap-5 text-xs font-bold text-slate-600 ml-4">
              <button onClick={() => navigate('home')} className={currentRoute === 'home' ? 'text-indigo-600' : 'hover:text-slate-900'}>
                Home
              </button>
              <button onClick={() => navigate('explore')} className={currentRoute === 'explore' ? 'text-indigo-600' : 'hover:text-slate-900'}>
                Explore Projects
              </button>
              <button onClick={() => navigate('selected-projects')} className={currentRoute === 'selected-projects' ? 'text-indigo-600' : 'hover:text-slate-900'}>
                Selected ({student.selectedProjectIds.length}/3)
              </button>
              <button onClick={() => navigate('schedule-meet')} className={currentRoute === 'schedule-meet' ? 'text-indigo-600' : 'hover:text-slate-900'}>
                5-Min Meet
              </button>
              <button onClick={() => navigate('support')} className={currentRoute === 'support' ? 'text-indigo-600' : 'hover:text-slate-900'}>
                Customer Support
              </button>
              <button
                onClick={() => setShareEarnModalOpen(true)}
                className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-extrabold"
              >
                <Share2 className="w-3.5 h-3.5" /> Share & Earn
              </button>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {student.authState !== 'logged_out' && renderHeartCredits('sm')}

            {student.authState === 'logged_out' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('login')}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600"
                >
                  Login
                </button>
                <button
                  onClick={() => navigate('signup')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                >
                  Sign Up
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('dashboard')}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                  {student.fullName.charAt(0)}
                </span>
                <span className="text-xs font-bold text-slate-800">Profile</span>
              </button>
            )}

          </div>

          {/* Mobile Navigation Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Content Router */}
      <main className="flex-1">
        {pageTransitionLoading ? (
          <div className="min-h-[60vh] flex items-center justify-center p-8">
            <UnikartLoader message={`Loading ${getRouteLabel(transitionTarget)}...`} size="lg" />
          </div>
        ) : (
          <>
            {currentRoute === 'home' && renderHomePage()}
            {currentRoute === 'explore' && renderExplorePage()}
            {currentRoute === 'project-details' && renderProjectDetailsPage()}
            {currentRoute === 'ppt-preview' && renderPptPreviewPage()}
            {currentRoute === 'how-it-works' && renderHomePage()}
            {currentRoute === 'login' && renderAuthAndVerificationPage('login')}
            {currentRoute === 'signup' && renderAuthAndVerificationPage('signup')}
            {currentRoute === 'admin-login' && renderAdminLoginPage()}
            {currentRoute === 'admin-change-password' && (
              adminSession?.mustChangePassword ? renderAdminChangePasswordPage() : renderAdminLoginPage()
            )}
            {currentRoute === 'verification' && renderAuthAndVerificationPage('verification')}
            {currentRoute === 'selected-projects' && renderSelectedProjectsPage()}
            {currentRoute === 'schedule-meet' && renderScheduleMeetPage()}
            {currentRoute === 'dashboard' && renderStudentDashboard()}
            {currentRoute === 'referrals' && (
              <div className="max-w-5xl mx-auto py-10 px-4">{renderReferralSection()}</div>
            )}
            {currentRoute === 'checkout' && renderCheckoutPage()}
            {currentRoute === 'support' && renderSupportSection()}
            {currentRoute === 'privacy' && renderLegalPage('privacy')}
            {currentRoute === 'terms' && renderLegalPage('terms')}
            {currentRoute === 'refund' && renderLegalPage('refund')}
            {currentRoute === 'admin' && renderAdminPanel()}
            {currentRoute === 'mentor' && renderAdminPanel('mentor')}
          </>
        )}
      </main>

      {/* G. Footer */}
      <footer className={(currentRoute === 'admin' || currentRoute === 'mentor') ? 'hidden' : 'bg-slate-900 text-slate-400 py-10 px-4 border-t border-slate-800 mt-16'}>
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          <div className="space-y-3">
            <TransparentBrandLogo className="h-10 w-auto object-contain" alt="Unikart" />
            <p className="leading-relaxed">
              Verified college & university project marketplace. Evaluate watermarked PPT previews safely and book 1-on-1 guidance sessions.
            </p>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase">Navigation</div>
            <ul className="space-y-1.5">
              <li><button onClick={() => navigate('explore')} className="hover:text-white">Explore Projects</button></li>
              <li><button onClick={() => navigate('verification')} className="hover:text-white">Student ID Verification</button></li>
              <li><button onClick={() => navigate('selected-projects')} className="hover:text-white">Selected Projects (Max 3)</button></li>
              <li><button onClick={() => navigate('referrals')} className="hover:text-white">Referral Program</button></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase">Legal & Policies</div>
            <ul className="space-y-1.5">
              <li><button onClick={() => navigate('privacy')} className="hover:text-white">Privacy Policy</button></li>
              <li><button onClick={() => navigate('terms')} className="hover:text-white">Terms & Conditions</button></li>
              <li><button onClick={() => navigate('refund')} className="hover:text-white">Refund Policy</button></li>
              <li><button onClick={() => navigate('admin-login')} className="hover:text-white">Admin</button></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-white uppercase">Support & Security</div>
            <p>All source code, UI files, and student ID uploads are strictly protected.</p>
            <button
              onClick={() => navigate('support')}
              className="mt-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-lg"
            >
              Contact Customer Support
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 mt-8 border-t border-slate-800 text-center text-xs">
          © {new Date().getFullYear()} Unikart Marketplace. All rights reserved.
        </div>
      </footer>
    </div>
  );
}