import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, Search, Filter, Heart, Calendar, CheckCircle2,
  Lock, FileText, Award, HelpCircle, LogOut, Menu, X, ChevronRight,
  ChevronLeft, Upload, ExternalLink, CreditCard,
  Layers, Code2, Cpu, Smartphone, Database, Cloud, Sparkles,
  Check, UserCheck, Eye, EyeOff, LayoutDashboard
} from 'lucide-react';
import {
  ProjectCategory, ProjectDTO,
  MeetingRecord, SupportTicket, StudentProfile
} from './types';
import {
  INITIAL_PROJECTS, INITIAL_STUDENT, INITIAL_MEETINGS,
  INITIAL_TICKETS, AVAILABLE_TIME_SLOTS
} from './mockData';
import { AdminAuthAPI, AdminAuthError } from './adminAuthService';
import { getPublicProjects, ProjectCatalogueError, useMockCatalogue } from './projectCatalogueService';
import StudentVerificationPage from './StudentVerificationPage';
import { StudentAuthAPI, StudentTokenResponse, VerificationApiError } from './verificationService';
import { StudentCommerceAPI, StudentOrderRecord } from './commerceService';
import StudentCommercePanel from './StudentCommercePanel';
import AdminDashboard from './admin/AdminDashboard';
import StudentReferralPage from './StudentReferralPage';
import { ReferralApiError, StudentReferralAPI } from './referralService';
import { supabase } from '../utils/supabase/client';

type PageRoute =
  | 'home'
  | 'explore'
  | 'project-details'
  | 'ppt-preview'
  | 'how-it-works'
  | 'login'
  | 'signup'
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
  | 'admin';

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

export default function App() {
  // Persistent state using localStorage
  const [currentRoute, setCurrentRoute] = useState<PageRoute>(() => {
    const hasReferralCode = new URLSearchParams(window.location.search).has('ref');
    return window.location.pathname.replace(/\/+$/, '') === '/register' || hasReferralCode
      ? 'signup'
      : 'home';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [student, setStudent] = useState<StudentProfile>(() => {
    const saved = localStorage.getItem('cpm_student_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.accessToken && parsed.authState && parsed.authState !== 'logged_out' && parsed.email) {
          return parsed;
        }
      } catch { /* fallback */ }
    }
    return { ...INITIAL_STUDENT, authState: 'logged_out' };
  });

  useEffect(() => {
    const persistedStudent = { ...student };
    delete persistedStudent.accessToken;
    localStorage.setItem('cpm_student_session', JSON.stringify(persistedStudent));
  }, [student]);

  const [projects, setProjects] = useState<ProjectDTO[]>(useMockCatalogue ? INITIAL_PROJECTS : []);
  const [catalogueLoading, setCatalogueLoading] = useState(!useMockCatalogue);
  const [catalogueError, setCatalogueError] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string>('PRJ-101');
  const [meetings, setMeetings] = useState<MeetingRecord[]>(INITIAL_MEETINGS);
  const [tickets, setTickets] = useState<SupportTicket[]>(INITIAL_TICKETS);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const [checkoutProjectId, setCheckoutProjectId] = useState<string>('PRJ-101');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<StudentOrderRecord | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

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

  const navigate = (route: PageRoute) => {
    setCurrentRoute(route);
    setMobileMenuOpen(false);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setStudent((previous) => ({ ...previous, authState: 'verified' }));
  }, []);

  const handleStudentSelectionsLoaded = useCallback((projectIds: string[]) => {
    setStudent((previous) => ({ ...previous, selectedProjectIds: projectIds }));
  }, []);

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

  const requestStudentOtp = async (mode: 'login' | 'signup') => {
    const contact = studentContact.trim();
    if (!contact) {
      setStudentAuthMessage('Enter your phone number or email address.');
      return;
    }
    if (mode === 'login' && contact.includes('@')) {
      setStudentAuthMessage('Student sign in currently uses the registered phone number.');
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
      const response = mode === 'login'
        ? await StudentAuthAPI.requestLoginOtp(contact)
        : await StudentAuthAPI.requestSignupOtp({
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
      const response: StudentTokenResponse = mode === 'login'
        ? await StudentAuthAPI.verifyLoginOtp(contact, studentOtp.trim())
        : await StudentAuthAPI.verifySignupOtp({
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

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) || projects[0], [projects, activeProjectId]);
  const checkoutProject = useMemo(() => projects.find((p) => p.id === checkoutProjectId) || projects[0], [projects, checkoutProjectId]);

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
    if (!useMockCatalogue) {
      showToast('Secure preview requires an authenticated backend student session.', 'error');
      return;
    }
    if (student.authState === 'logged_out') {
      showToast('Please log in and verify your student ID to access PPT previews.', 'error');
      navigate('login');
      return;
    }
    if (student.authState !== 'verified') {
      showToast('Access restricted: Only verified students can view protected PPT previews.', 'error');
      navigate('verification');
      return;
    }

    const alreadyViewed = student.viewedProjectIds.includes(project.id);
    if (!alreadyViewed && student.previewStats.remainingPreviews <= 0) {
      showToast(`Preview limit reached (0/5 credits left). Next reset: ${student.previewStats.nextResetDate}`, 'error');
      return;
    }

    if (!alreadyViewed) {
      setStudent((prev) => ({
        ...prev,
        viewedProjectIds: [...prev.viewedProjectIds, project.id],
        previewStats: {
          ...prev.previewStats,
          usedPreviews: prev.previewStats.usedPreviews + 1,
          remainingPreviews: prev.previewStats.remainingPreviews - 1,
        },
      }));
      showToast('1 PPT Preview Credit used. Watermarked preview unlocked.', 'info');
    }

    setActiveProjectId(project.id);
    setCurrentSlideIndex(0);
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
    const total = student.previewStats.totalAllowed;
    const remaining = student.previewStats.remainingPreviews;
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
            <span className="absolute right-3 top-12 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-extrabold tracking-wide text-white shadow">
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
              <p className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading live catalogue…</p>
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
            { step: '1', title: 'Create Account', desc: 'Sign up using Mobile OTP or Google.' },
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
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading live catalogue…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Search className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">{projects.length ? 'No Matching Projects Found' : 'No Projects Available'}</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              {projects.length
                ? 'No projects match your current filter combination. Try resetting the technology or difficulty filters.'
                : 'The live catalogue is empty. Please check back later.'}
            </p>
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
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-extrabold text-white">
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
    if (!useMockCatalogue) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Lock className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Secure preview unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">A backend-authenticated student session is required to open protected presentations.</p>
        </div>
      );
    }
    const slides = activeProject.pptSlides;
    const currentSlide = slides[currentSlideIndex] || slides[0];

    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Protected PPT Document Viewer
            </span>
            <h1 className="text-lg font-bold text-slate-900">{activeProject.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {renderHeartCredits('sm')}
            <button
              onClick={() => navigate('project-details')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Close Preview
            </button>
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-2.5 rounded-xl text-xs mb-4 flex items-center justify-between flex-wrap gap-2">
          <span>
            <strong>Preview Policy:</strong> Maximum 5 previews per 90-day cycle. Original PPT download links and source code are disabled.
          </span>
          <span className="font-mono font-semibold">Reset Date: {student.previewStats.nextResetDate}</span>
        </div>

        <div
          onContextMenu={(e) => e.preventDefault()}
          className="bg-slate-900 text-white rounded-2xl border-2 border-slate-700 shadow-2xl p-8 sm:p-14 min-h-[380px] flex flex-col justify-between relative overflow-hidden select-none"
        >
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-10 -rotate-12">
            <p className="text-2xl sm:text-4xl font-extrabold tracking-widest uppercase text-center">
              PREVIEW ONLY • {student.fullName}
            </p>
            <p className="text-lg sm:text-2xl font-mono mt-2">
              {student.collegeName} • {student.mobile}
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
              {currentSlide.bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-3 text-slate-200 text-sm sm:text-base">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/30 border border-indigo-400 text-indigo-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 mt-8">
            <span>{currentSlide.footerNote}</span>
            <span>CampusProjects Protected Viewer</span>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <button
            disabled={currentSlideIndex === 0}
            onClick={() => setCurrentSlideIndex((i) => Math.max(0, i - 1))}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 text-xs font-bold rounded-lg inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Previous Slide
          </button>

          <span className="text-xs font-bold text-slate-700">
            Page {currentSlideIndex + 1} of {slides.length}
          </span>

          <button
            disabled={currentSlideIndex === slides.length - 1}
            onClick={() => setCurrentSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1"
          >
            Next Slide <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderAuthAndVerificationPage = (mode: 'login' | 'signup' | 'verification') => {
    if (mode === 'verification') {
      return (
        <StudentVerificationPage
          accessToken={student.accessToken}
          onLogin={() => navigate('login')}
          onContinue={() => navigate('dashboard')}
          onSessionExpired={handleStudentSessionExpired}
          onApproved={handleStudentApproved}
        />
      );
    }

    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (studentOtpRequested) void verifyStudentOtp(mode);
            else void requestStudentOtp(mode);
          }}
          className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5"
        >
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {mode === 'login' ? 'Student Login' : 'Create Student Account'}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              {mode === 'login'
                ? 'Sign in with a one-time code sent to your registered phone.'
                : 'Create your student profile, then submit your student ID for verification.'}
            </p>
          </div>

          {mode === 'signup' && (
            <>
              <label className="block text-xs font-bold text-slate-700">Full Name
              <input
                type="text"
                required
                minLength={2}
                maxLength={255}
                value={studentSignupName}
                onChange={(event) => setStudentSignupName(event.target.value)}
                placeholder="e.g. Rahul Kumar"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-normal"
              />
              </label>
              <label className="block text-xs font-bold text-slate-700">College / University
                <input required minLength={2} maxLength={255} value={studentSignupCollege} onChange={(event) => setStudentSignupCollege(event.target.value)} placeholder="Your institute" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-normal" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Course / Department
                <input required minLength={2} maxLength={255} value={studentSignupCourse} onChange={(event) => setStudentSignupCourse(event.target.value)} placeholder="e.g. B.Tech Computer Science" className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-normal" />
              </label>
            </>
          )}

          <label className="block text-xs font-bold text-slate-700">
            {mode === 'login' ? 'Registered phone number' : 'Email address or phone number'}
            <input
              type="text"
              required
              value={studentContact}
              onChange={(event) => setStudentContact(event.target.value)}
              placeholder={mode === 'login' ? '+91 98765 43210' : 'student@example.com'}
              disabled={studentOtpRequested}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-normal"
            />
          </label>

          {studentOtpRequested && (
            <label className="block text-xs font-bold text-slate-700">One-time code
            <input
              required
              minLength={4}
              maxLength={12}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={studentOtp}
              onChange={(event) => setStudentOtp(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-normal"
            />
            </label>
          )}

          {studentAuthMessage && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{studentAuthMessage}</p>}

          <button type="submit" disabled={studentAuthLoading} className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
            {studentAuthLoading ? 'Please wait…' : studentOtpRequested ? 'Verify code' : mode === 'signup' ? 'Create account & request code' : 'Request sign-in code'}
          </button>
          {studentOtpRequested && <button type="button" disabled={studentAuthLoading} onClick={() => { setStudentOtpRequested(false); setStudentOtp(''); setStudentAuthMessage(''); }} className="w-full text-xs font-semibold text-slate-500 hover:text-indigo-700">Change contact details</button>}
          <p className="text-center text-xs text-slate-500">
            {mode === 'login' ? 'New student?' : 'Already registered?'}{' '}
            <button type="button" onClick={() => { setStudentOtpRequested(false); setStudentOtp(''); setStudentAuthMessage(''); navigate(mode === 'login' ? 'signup' : 'login'); }} className="font-semibold text-indigo-700 hover:underline">
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    );
  };

  const renderAdminLoginPage = () => (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5">
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
        </form>
      </div>
    </div>
  );

  const renderSelectedAndMeetPage = () => {
    if (currentRoute === 'selected-projects' || currentRoute === 'schedule-meet') {
      return (
        <StudentCommercePanel
          view={currentRoute === 'selected-projects' ? 'selected' : 'meetings'}
          accessToken={student.accessToken}
          projects={projects}
          viewedProjectIds={student.viewedProjectIds}
          onSelectionChange={handleStudentSelectionsLoaded}
          onToggleSelection={handleToggleSelectProject}
          onSessionExpired={handleStudentSessionExpired}
          onLogin={() => navigate('login')}
        />
      );
    }

    const viewedProjects = projects.filter((p) => student.viewedProjectIds.includes(p.id));
    const selectedProjects = projects.filter((p) => student.selectedProjectIds.includes(p.id));

    return (
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Selected Projects for Guidance</h1>
              <p className="text-xs text-slate-600 mt-1">
                You may select up to 3 projects from your previously previewed projects to book 5-minute 1-on-1 Google Meet calls.
              </p>
            </div>
            <div className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900">
              Selected Counter: {student.selectedProjectIds.length} / 3 Maximum
            </div>
          </div>

          {viewedProjects.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">You haven't previewed any project PPTs yet.</p>
              <button
                onClick={() => navigate('explore')}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg"
              >
                Explore & Preview Projects
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {viewedProjects.map((proj) => {
                const isSelected = student.selectedProjectIds.includes(proj.id);
                const existingMeet = meetings.find((m) => m.projectId === proj.id);
                return (
                  <div
                    key={proj.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected ? 'border-indigo-600 bg-indigo-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-mono text-slate-500">{proj.id}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isSelected ? 'Selected' : 'Viewed'}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm mb-2">{proj.title}</h3>
                      <p className="text-xs text-slate-600 mb-3">
                        Meeting Status: <strong className="text-slate-900">{existingMeet ? existingMeet.status : 'Not Requested'}</strong>
                      </p>
                    </div>
                    <div className="space-y-2 pt-3 border-t border-slate-200/70">
                      <button
                        onClick={() => handleToggleSelectProject(proj.id)}
                        className={`w-full py-2 text-xs font-bold rounded-lg border ${
                          isSelected
                            ? 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100'
                            : 'border-indigo-600 text-indigo-600 hover:bg-indigo-50'
                        }`}
                      >
                        {isSelected ? 'Deselect Project' : 'Select Project (Max 3)'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Request 5-Min Google Meet</h2>
            <p className="text-xs text-slate-600 mb-4">
              Meetings are scheduled (not instant calls). Duration is strictly 5 minutes per selected project.
            </p>

            {selectedProjects.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                Please select at least 1 viewed project above to unlock the meeting request form.
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (meetings.length >= 3) {
                    showToast('Maximum 3 guidance meetings allowed per student.', 'error');
                    return;
                  }
                  const formData = new FormData(e.currentTarget);
                  const projId = formData.get('projectId') as string;
                  const date = formData.get('date') as string;
                  const slot = formData.get('slot') as string;
                  const projObj = projects.find((p) => p.id === projId);
                  if (!projObj) return;

                  const newMeet: MeetingRecord = {
                    id: `MEET-${Math.floor(100 + Math.random() * 900)}`,
                    projectId: projObj.id,
                    projectTitle: projObj.title,
                    date,
                    timeSlot: slot,
                    durationMinutes: 5,
                    status: 'Request Submitted',
                  };
                  setMeetings((prev) => [newMeet, ...prev]);
                  showToast('Meeting request submitted! Awaiting mentor confirmation.', 'success');
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Selected Project</label>
                  <select name="projectId" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    {selectedProjects.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Available Date</label>
                  <input
                    type="date"
                    name="date"
                    defaultValue="2026-10-30"
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Available 5-Minute Time Slots</label>
                  <select name="slot" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    {AVAILABLE_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                  <span>Fixed Session Duration:</span>
                  <strong className="text-slate-900">5 Minutes (Google Meet)</strong>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                >
                  Request Meeting ({meetings.length}/3 Used)
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Your Guidance Meetings ({meetings.length}/3)</h2>
            <div className="space-y-3">
              {meetings.map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500">{m.id}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        m.status === 'Scheduled'
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.status === 'Cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {m.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">{m.projectTitle}</h3>
                    <p className="text-xs text-slate-600">
                      Date: <strong>{m.date}</strong> • Slot: <strong>{m.timeSlot}</strong> • Duration: <strong>{m.durationMinutes} mins</strong>
                    </p>
                    {m.meetLink && m.status === 'Scheduled' && (
                      <a
                        href={m.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline pt-1"
                      >
                        Join Authorized Google Meet <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex sm:flex-col gap-2 shrink-0">
                    {m.status !== 'Cancelled' && m.status !== 'Completed' && (
                      <button
                        onClick={() => {
                          setMeetings((prev) =>
                            prev.map((item) => (item.id === m.id ? { ...item, status: 'Cancelled' } : item))
                          );
                          showToast('Meeting cancelled.', 'info');
                        }}
                        className="px-3 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-lg"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStudentDashboard = () => (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 bg-indigo-950 text-white rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="pb-4 border-b border-white/10">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-lg flex items-center justify-center mb-3">
                {student.fullName.charAt(0)}
              </div>
              <h2 className="font-bold text-base">{student.fullName}</h2>
              <p className="text-xs text-indigo-200 mt-0.5">{student.collegeName}</p>
              <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                student.authState === 'verified' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
              }`}>
                <ShieldCheck className="w-3.5 h-3.5" /> {student.authState.toUpperCase().replace('_', ' ')}
              </span>
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
                setStudent({ ...INITIAL_STUDENT, authState: 'logged_out' });
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
          <div className="grid sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">Preview Credits</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {student.previewStats.remainingPreviews} / {student.previewStats.totalAllowed} ♥
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Reset: {student.previewStats.nextResetDate}</div>
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
                  <h3 className="text-lg font-bold text-slate-900">Student Profile & Preview Statistics</h3>
                  <p className="text-xs text-slate-500">Authoritative profile state synced with backend verification</p>
                </div>
                {renderHeartCredits()}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500">Full Name</div>
                  <div className="font-bold text-slate-900">{student.fullName}</div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500">College / University</div>
                  <div className="font-bold text-slate-900">{student.collegeName}</div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500">Mobile & Email</div>
                  <div className="font-bold text-slate-900">{student.mobile} • {student.email}</div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500">90-Day Preview Reset Schedule</div>
                  <div className="font-bold text-indigo-700">
                    Used: {student.previewStats.usedPreviews} • Remaining: {student.previewStats.remainingPreviews} • Next Reset: {student.previewStats.nextResetDate}
                  </div>
                </div>
              </div>

              {/* MODIFIED: Upload ID Card Front & Back Panel */}
              {student.authState !== 'verified' && (
                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-bold text-amber-900">Complete Your Student Verification</h3>
                  </div>
                  <p className="text-xs text-amber-800 mb-4">
                    Please upload clear images of the front and back of your valid college/university ID card. Without verification, PPT previews are locked.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="border-2 border-dashed border-amber-300 rounded-xl p-5 text-center bg-white hover:bg-amber-50/50 transition-colors cursor-pointer">
                      <Upload className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <label className="block text-xs font-bold text-slate-700 mb-1">ID Card (Front Side)</label>
                      <input type="file" className="text-[10px] text-slate-500 w-full" />
                    </div>
                    <div className="border-2 border-dashed border-amber-300 rounded-xl p-5 text-center bg-white hover:bg-amber-50/50 transition-colors cursor-pointer">
                      <Upload className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <label className="block text-xs font-bold text-slate-700 mb-1">ID Card (Back Side)</label>
                      <input type="file" className="text-[10px] text-slate-500 w-full" />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setStudent({ ...student, authState: 'verification_pending' });
                      showToast('ID documents submitted for admin review!', 'success');
                    }}
                    className="mt-4 w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-amber-950 text-sm font-bold rounded-xl transition-all"
                  >
                    Submit Documents for Verification
                  </button>
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
              projects={projects}
              onSessionExpired={handleStudentSessionExpired}
              onLogin={() => navigate('login')}
            />
          )}

          {dashboardTab === 'referrals' && renderReferralSection()}

          {dashboardTab === 'purchases' && (
            <StudentCommercePanel
              view="orders"
              accessToken={student.accessToken}
              projects={projects}
              onSessionExpired={handleStudentSessionExpired}
              onLogin={() => navigate('login')}
            />
          )}

          {dashboardTab === 'support' && renderSupportSection()}
        </div>
      </div>
    </div>
  );

  const renderReferralSection = () => (
    <StudentReferralPage
      accessToken={student.accessToken}
      onSessionExpired={handleStudentSessionExpired}
      onLogin={() => navigate('login')}
    />
  );

  const renderCheckoutPage = () => {
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

    const createPendingOrder = async () => {
      if (!student.accessToken) {
        navigate('login');
        return;
      }
      const projectId = Number(checkoutProject.id);
      if (!Number.isSafeInteger(projectId) || projectId < 1) {
        showToast('This catalogue project cannot be purchased through the backend.', 'error');
        return;
      }
      setOrderSubmitting(true);
      try {
        const order = await StudentCommerceAPI.createOrder(student.accessToken, projectId);
        setCheckoutOrder(order);
        showToast('Order created. The backend returned its current order and payment statuses.', 'info');
      } catch (error) {
        if (error instanceof VerificationApiError && [401, 403].includes(error.status)) {
          handleStudentSessionExpired();
        } else {
          showToast(error instanceof Error ? error.message : 'Unable to create the order.', 'error');
        }
      } finally {
        setOrderSubmitting(false);
      }
    };

    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <span className="text-xs font-bold uppercase text-indigo-600">Verified Student Checkout</span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{checkoutProject.title}</h1>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700">Included Project Deliverables:</div>
            <ul className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
              {checkoutProject.deliverables.map((d) => (
                <li key={d} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 text-sm border-t border-b border-slate-200 py-4">
            <div className="flex justify-between">
              <span className="text-slate-600">Catalogue price:</span>
              <span className="font-bold text-slate-900">₹{checkoutProject.price}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-100">
              <span>{checkoutOrder ? 'Order amount (confirmed by backend):' : 'Estimated order amount:'}</span>
              <span>₹{checkoutOrder?.amount ?? finalPayable}</span>
            </div>
            <p className="text-xs text-slate-500">Reward balances do not alter this order. A payment gateway must confirm payment separately.</p>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600"
            />
            <span>
              I acknowledge the <button onClick={() => navigate('terms')} className="text-indigo-600 underline">Terms & Conditions</button> and <button onClick={() => navigate('refund')} className="text-indigo-600 underline">Refund Policy</button>. Project deliverables are for academic learning and reference.
            </span>
          </label>

          {checkoutOrder ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" /> Order #{checkoutOrder.id} created · Order {checkoutOrder.status.toLowerCase()} · Payment {checkoutOrder.payment_status?.toLowerCase().replace(/_/g, ' ') || 'not recorded'}
              </div>
              <p className="text-xs text-amber-900">The order and payment statuses above came from the backend. Payment changes only after a verified gateway event.</p>
              <button
                onClick={() => {
                  setDashboardTab('purchases');
                  navigate('dashboard');
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg"
              >
                View My Orders
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                disabled={!acceptedTerms || orderSubmitting}
                onClick={() => void createPendingOrder()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl"
              >
                {orderSubmitting ? 'Creating order…' : `Create Pending Order (₹${finalPayable})`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSupportSection = () => (
    <div className="max-w-5xl mx-auto py-8 px-4 grid md:grid-cols-12 gap-8">
      <div className="md:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Create Support Ticket</h2>
        <p className="text-xs text-slate-500 mb-4">Our student support desk responds within 4 working hours.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const newTicket: SupportTicket = {
              ticketId: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
              category: fd.get('category') as string,
              subject: fd.get('subject') as string,
              description: fd.get('description') as string,
              submissionDate: '26 Oct 2026',
              status: 'Open',
            };
            setTickets((prev) => [newTicket, ...prev]);
            e.currentTarget.reset();
            showToast(`Support Ticket ${newTicket.ticketId} submitted successfully!`, 'success');
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Issue Category</label>
            <select name="category" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
              <option>Account / Login</option>
              <option>Student Verification</option>
              <option>PPT Preview Access</option>
              <option>Project Selection</option>
              <option>Meeting Scheduling</option>
              <option>Payment Issues</option>
              <option>Project Delivery</option>
              <option>Refund Requests</option>
              <option>General Queries</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
            <input name="subject" required placeholder="Brief summary of the issue" className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
            <textarea name="description" required rows={3} placeholder="Provide Order ID or Project ID if applicable..." className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl">
            Submit Ticket
          </button>
        </form>
      </div>

      <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Ticket History</h2>
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.ticketId} className="p-4 rounded-xl border border-slate-200 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-indigo-600">{t.ticketId}</span>
                  <span className="text-slate-400">•</span>
                  <span className="font-semibold text-slate-700">{t.category}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">{t.submissionDate}</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-1">{t.subject}</h3>
                <p className="text-xs text-slate-600 mt-1">{t.description}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {t.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAdminPanel = () => {
    if (!adminSession) return renderAdminLoginPage();
    if (adminSession.mustChangePassword) return renderAdminChangePasswordPage();

    return (
      <AdminDashboard
        accessToken={adminSession.accessToken}
        onLogout={handleAdminLogout}
        onSessionExpired={handleAdminSessionExpired}
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

      {/* Feature Sidebar Drawer (Collapsible Feature Panel) */}
      {currentRoute !== 'admin' && sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
          />
          {/* Sidebar Drawer */}
          <div className="relative w-80 bg-slate-900 text-white p-6 flex flex-col justify-between z-10 shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                    C
                  </div>
                  <div>
                    <span className="font-bold text-sm">Feature Directory</span>
                    <span className="block text-[10px] text-emerald-400">All Marketplace Modules</span>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1.5 text-xs font-semibold">
                <button
                  onClick={() => navigate('home')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-400" /> Home & Overview
                </button>
                <button
                  onClick={() => navigate('explore')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <Search className="w-4 h-4 text-emerald-400" /> Explore Catalogue & Filters
                </button>
                <button
                  onClick={() => navigate('selected-projects')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-400" /> Selected Projects ({student.selectedProjectIds.length}/3)
                </button>
                <button
                  onClick={() => navigate('schedule-meet')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <Calendar className="w-4 h-4 text-violet-400" /> 5-Min Google Meet Scheduler
                </button>
                <button
                  onClick={() => navigate('dashboard')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-cyan-400" /> Student Profile Dashboard
                </button>
                <button
                  onClick={() => navigate('referrals')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <Award className="w-4 h-4 text-rose-400" /> Referral & Reward Hub
                </button>
                <button
                  onClick={() => navigate('support')}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <HelpCircle className="w-4 h-4 text-sky-400" /> Customer Support Desk
                </button>
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400">
              CampusProjects v2.4 • Client Handover Build
            </div>
          </div>
        </div>
      )}

      {/* A. Navigation Bar */}
      <header className={currentRoute === 'admin' ? 'hidden' : 'bg-white border-b border-slate-200 sticky top-0 z-40'}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Sidebar Toggle Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              title="Open Feature Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button onClick={() => navigate('home')} className="flex items-center gap-2 text-left">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
                C
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-900">CampusProjects</span>
                <span className="block text-[10px] font-mono text-emerald-600 font-semibold -mt-1">
                  VERIFIED STUDENT MARKETPLACE
                </span>
              </div>
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

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Collapsible Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-3 text-sm font-bold">
            <div className="pb-2">{renderHeartCredits('sm')}</div>
            <button onClick={() => navigate('home')} className="block w-full text-left py-1.5">Home</button>
            <button onClick={() => navigate('explore')} className="block w-full text-left py-1.5">Explore Projects</button>
            <button onClick={() => navigate('selected-projects')} className="block w-full text-left py-1.5">Selected Projects ({student.selectedProjectIds.length}/3)</button>
            <button onClick={() => navigate('schedule-meet')} className="block w-full text-left py-1.5">Schedule 5-Min Meet</button>
            <button onClick={() => navigate('dashboard')} className="block w-full text-left py-1.5">Student Profile Dashboard</button>
            <button onClick={() => navigate('support')} className="block w-full text-left py-1.5">Customer Support</button>
            <button onClick={() => navigate('verification')} className="block w-full text-left py-1.5 text-indigo-600">Student ID Verification</button>
          </div>
        )}
      </header>

      {/* Main Content Router */}
      <main className="flex-1">
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
        {(currentRoute === 'selected-projects' || currentRoute === 'schedule-meet') && renderSelectedAndMeetPage()}
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
      </main>

      {/* G. Footer */}
      <footer className={currentRoute === 'admin' ? 'hidden' : 'bg-slate-900 text-slate-400 py-10 px-4 border-t border-slate-800 mt-16'}>
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          <div className="space-y-2">
            <div className="font-extrabold text-white text-base">CampusProjects</div>
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
          © {new Date().getFullYear()} CampusProjects Marketplace. All rights reserved.
        </div>
      </footer>
    </div>
  );
}