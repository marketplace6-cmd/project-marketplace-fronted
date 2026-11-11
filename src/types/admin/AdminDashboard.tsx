import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Archive,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Users,
  Video,
  X
} from 'lucide-react';
import {
  AdminAuthAPI,
  AdminAuthError,
  AdminDashboardStats,
  AdminDashboardSummary
} from '../adminAuthService';
import { supabase } from '../../utils/supabase/client';
import AdminCatalogPage from './AdminCatalogPage';
import AdminVerificationPage from './AdminVerificationPage';
import AdminMeetingsOrdersPage from './AdminMeetingsOrdersPage';
import AdminReferralPage from './AdminReferralPage';
import AdminSecurityPage from './AdminSecurityPage';

type AdminSection =
  | 'overview'
  | 'projects'
  | 'verification'
  | 'meetings-orders'
  | 'referrals'
  | 'notifications'
  | 'profile';

interface AdminDashboardProps {
  accessToken: string;
  onLogout: () => void;
  onSessionExpired: () => void;
}

const navigation: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Manage Catalogue Projects', icon: FolderKanban },
  { id: 'verification', label: 'Student ID Verification', icon: FileCheck2 },
  { id: 'meetings-orders', label: 'Meetings & Orders', icon: ClipboardList },
  { id: 'referrals', label: 'Referral Management', icon: CircleDollarSign },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Admin Profile & Security', icon: ShieldCheck }
];

type MetricKey = keyof AdminDashboardStats;

const metrics: {
  key: MetricKey;
  label: string;
  description: string;
  icon: typeof Users;
  tone: string;
}[] = [
  { key: 'total_students', label: 'Total Students', description: 'Student accounts', icon: Users, tone: 'indigo' },
  { key: 'verified_students', label: 'Verified Students', description: 'Approved ID submissions', icon: ShieldCheck, tone: 'emerald' },
  { key: 'pending_verifications', label: 'Pending Verifications', description: 'Awaiting review', icon: FileCheck2, tone: 'amber' },
  { key: 'total_projects', label: 'Total Projects', description: 'All catalogue records', icon: FolderKanban, tone: 'violet' },
  { key: 'active_projects', label: 'Active Projects', description: 'Published and available', icon: CheckCircle2, tone: 'emerald' },
  { key: 'sold_out_projects', label: 'Sold Out Projects', description: 'Inventory state', icon: Archive, tone: 'slate' },
  { key: 'total_orders', label: 'Total Orders', description: 'All order records', icon: ShoppingBag, tone: 'blue' },
  { key: 'pending_orders', label: 'Pending Orders', description: 'Awaiting payment', icon: ClipboardList, tone: 'amber' },
  { key: 'approved_orders', label: 'Approved Orders', description: 'Order approval state', icon: CheckCircle2, tone: 'slate' },
  { key: 'total_meetings', label: 'Total Meetings', description: 'All meeting requests', icon: Video, tone: 'blue' },
  { key: 'pending_meetings', label: 'Pending Meetings', description: 'Awaiting a decision', icon: ClipboardList, tone: 'amber' },
  { key: 'approved_meetings', label: 'Approved Meetings', description: 'Scheduled by Admin', icon: CheckCircle2, tone: 'emerald' },
  { key: 'total_referrals', label: 'Total Referrals', description: 'Referral records', icon: Users, tone: 'violet' },
  { key: 'eligible_rewards', label: 'Eligible Rewards', description: 'Rewards for paid orders', icon: CircleDollarSign, tone: 'emerald' }
];

const toneClasses: Record<string, { icon: string; value: string }> = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-slate-950' },
  emerald: { icon: 'bg-emerald-50 text-emerald-700', value: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-700', value: 'text-amber-700' },
  violet: { icon: 'bg-violet-50 text-violet-700', value: 'text-slate-950' },
  blue: { icon: 'bg-blue-50 text-blue-700', value: 'text-slate-950' },
  slate: { icon: 'bg-slate-100 text-slate-500', value: 'text-slate-400' }
};

function AdminStatCard({
  label,
  description,
  value,
  unavailable,
  icon: Icon,
  tone
}: {
  label: string;
  description: string;
  value: number | null;
  unavailable?: string;
  icon: typeof Users;
  tone: string;
}) {
  const classes = toneClasses[tone] || toneClasses.indigo;
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${classes.value}`}>
            {value === null ? '—' : new Intl.NumberFormat().format(value)}
          </p>
        </div>
        <span className={`rounded-lg p-2 ${classes.icon}`}><Icon size={17} /></span>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{unavailable || description}</p>
    </article>
  );
}

function AdminOverview({
  summary,
  loading,
  error,
  onRetry
}: {
  summary: AdminDashboardSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div aria-label="Loading dashboard" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.key} className="h-[112px] animate-pulse rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-2/3 rounded bg-slate-100" />
            <div className="mt-4 h-6 w-1/3 rounded bg-slate-100" />
            <div className="mt-3 h-2.5 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">Dashboard data is unavailable</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">
          {error || 'The dashboard API did not return data.'}
        </p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const { stats } = summary;
  const isEmpty = stats.total_students + stats.total_projects + stats.total_orders
    + stats.total_meetings + stats.total_referrals === 0;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          No marketplace records yet. Statistics will update as real data is added.
        </div>
      )}
      <section aria-label="Marketplace statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <AdminStatCard
            key={metric.key}
            label={metric.label}
            description={metric.description}
            icon={metric.icon}
            tone={metric.tone}
            value={stats[metric.key]}
            unavailable={summary.unavailable[metric.key]}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent activity</h2>
            <p className="mt-0.5 text-xs text-slate-500">Latest recorded Admin actions</p>
          </div>
          <Activity size={17} className="text-slate-400" />
        </div>
        {summary.recent_activity.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No recent activity has been recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.recent_activity.map((activity) => (
              <li key={activity.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {activity.action.replaceAll('_', ' ')}
                  </p>
                  {activity.entity && <p className="mt-0.5 text-xs text-slate-500">{activity.entity}</p>}
                </div>
                <time dateTime={activity.created_at} className="shrink-0 text-xs text-slate-500">
                  {new Date(activity.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdminPlaceholderPage({ section }: { section: AdminSection }) {
  const current = navigation.find((item) => item.id === section);
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        {current && <current.icon size={22} />}
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{current?.label}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        This section is reserved for a future development phase. No management actions are available here yet.
      </p>
      {section === 'profile' && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck size={15} /> Your session is authenticated by the backend.
        </p>
      )}
    </section>
  );
}

function AdminSidebar({
  activeSection,
  onNavigate,
  onLogout,
  mobileOpen,
  onClose
}: {
  activeSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
      <aside className={`${mobileOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-40 w-[270px] border-r border-slate-200 bg-white px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 lg:flex-col`}>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><ShieldCheck size={19} /></span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">CampusProjects</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Administration</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><X size={18} /></button>
        </div>
        <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
        <nav aria-label="Admin navigation" className="space-y-1">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                activeSection === id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={16} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            <LogOut size={16} /> Logout
          </button>
          <p className="mt-4 px-3 text-[10px] text-slate-400">Secure Admin workspace</p>
        </div>
      </aside>
    </>
  );
}

export default function AdminDashboard({ accessToken, onLogout, onSessionExpired }: AdminDashboardProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    AdminAuthAPI.getDashboard(accessToken)
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof AdminAuthError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
          return;
        }
        setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, onSessionExpired, retryCount]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let checking = false;

    const validateSession = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await AdminAuthAPI.getDashboard(accessToken);
        if (active) {
          setSummary(result);
          setError(null);
        }
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof AdminAuthError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
          return;
        }
        setError(requestError instanceof Error ? requestError.message : 'Unable to validate the Admin session.');
      } finally {
        checking = false;
        if (active) timer = setTimeout(validateSession, 60_000);
      }
    };

    const validateOnReturn = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void validateSession();
      }
    };

    timer = setTimeout(validateSession, 60_000);
    document.addEventListener('visibilitychange', validateOnReturn);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', validateOnReturn);
    };
  }, [accessToken, onSessionExpired]);

  // Real-time listener for dashboard metrics
  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        AdminAuthAPI.getDashboard(accessToken).then((result) => setSummary(result)).catch(() => {});
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accessToken]);

  const retryDashboard = () => {
    setLoading(true);
    setError(null);
    setRetryCount((count) => count + 1);
  };
  const refreshDashboard = () => setRetryCount((count) => count + 1);

  const activeNav = navigation.find((item) => item.id === activeSection);
  const title = activeSection === 'overview' ? 'Admin Dashboard' : activeNav?.label || 'Admin Dashboard';

  return (
    <div className="min-h-[70vh] bg-slate-50 lg:flex">
      <AdminSidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
                <Menu size={19} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h1>
                <p className="hidden text-xs text-slate-500 sm:block">
                  {activeSection === 'overview' ? 'Welcome back. Here is your marketplace overview.' : 'Admin workspace'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setActiveSection('notifications');
                  setProfileOpen(false);
                }}
                aria-label="Notifications"
                title="Notifications"
                className={`rounded-lg p-2 hover:bg-slate-100 ${activeSection === 'notifications' ? 'text-indigo-700' : 'text-slate-500'}`}
              >
                <Bell size={18} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">A</span>
                  <span className="hidden max-w-32 text-left sm:block">
                    <span className="block text-[10px] font-semibold text-slate-800">Admin</span>
                    <span className="block truncate text-[10px] text-slate-500">{summary?.admin_id || 'Authenticated account'}</span>
                  </span>
                  <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    <button
                      onClick={() => {
                        setActiveSection('profile');
                        setProfileOpen(false);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Profile & security
                      <span className="mt-1 block break-all text-[10px] text-slate-500">{summary?.admin_id || 'Loading account ID'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveSection('profile');
                        setProfileOpen(false);
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <KeyRound size={14} className="text-indigo-600" /> Change password
                    </button>
                    <button
                      onClick={onLogout}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 sm:py-7">
          {activeSection === 'overview' ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Marketplace overview</p>
                  <p className="mt-1 text-xs text-slate-500">Live counts from the backend. Unsupported metrics are clearly marked.</p>
                </div>
                <button
                  onClick={retryDashboard}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
              <AdminOverview
                summary={summary}
                loading={loading}
                error={error}
                onRetry={retryDashboard}
              />
            </>
          ) : activeSection === 'projects' ? (
            <AdminCatalogPage
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
            />
          ) : activeSection === 'verification' ? (
            <AdminVerificationPage
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
              onChanged={refreshDashboard}
            />
          ) : activeSection === 'meetings-orders' ? (
            <AdminMeetingsOrdersPage
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
              onChanged={refreshDashboard}
            />
          ) : activeSection === 'referrals' ? (
            <AdminReferralPage
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
            />
          ) : activeSection === 'profile' ? (
            <AdminSecurityPage
              adminId={summary?.admin_id || '20232027'}
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <AdminPlaceholderPage section={activeSection} />
          )}
        </main>
      </div>
    </div>
  );
}
