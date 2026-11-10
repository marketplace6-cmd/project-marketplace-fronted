export interface AdminTokenResponse {
  access_token: string;
  token_type: 'bearer';
  user_id: number;
  must_change_password: boolean;
}

export interface AdminDashboardStats {
  total_students: number;
  verified_students: number;
  pending_verifications: number;
  total_projects: number;
  active_projects: number;
  sold_out_projects: number | null;
  total_orders: number;
  pending_orders: number;
  approved_orders: number | null;
  total_meetings: number;
  pending_meetings: number;
  approved_meetings: number;
  total_referrals: number;
  eligible_rewards: number;
}

export interface AdminDashboardActivity {
  id: number;
  action: string;
  entity: string | null;
  created_at: string;
}

export interface AdminDashboardSummary {
  admin_id: string;
  stats: AdminDashboardStats;
  unavailable: Record<string, string>;
  recent_activity: AdminDashboardActivity[];
}

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

const configuredBaseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/+$/, '');
const API_BASE_URL = configuredBaseUrl.endsWith('/api/v1')
  ? configuredBaseUrl
  : configuredBaseUrl.endsWith('/api')
    ? `${configuredBaseUrl}/v1`
    : `${configuredBaseUrl}/api/v1`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTokenResponse(value: unknown): AdminTokenResponse {
  if (
    !isRecord(value) ||
    typeof value.access_token !== 'string' ||
    value.token_type !== 'bearer' ||
    typeof value.user_id !== 'number' ||
    typeof value.must_change_password !== 'boolean'
  ) {
    throw new AdminAuthError('Authentication service returned an invalid response.', 502);
  }
  return {
    access_token: value.access_token,
    token_type: 'bearer',
    user_id: value.user_id,
    must_change_password: value.must_change_password
  };
}

function parseDashboardResponse(value: unknown): AdminDashboardSummary {
  if (!isRecord(value) || typeof value.admin_id !== 'string' || !isRecord(value.stats)) {
    throw new AdminAuthError('Dashboard service returned an invalid response.', 502);
  }

  const statisticKeys: (keyof AdminDashboardStats)[] = [
    'total_students',
    'verified_students',
    'pending_verifications',
    'total_projects',
    'active_projects',
    'sold_out_projects',
    'total_orders',
    'pending_orders',
    'approved_orders',
    'total_meetings',
    'pending_meetings',
    'approved_meetings',
    'total_referrals',
    'eligible_rewards'
  ];
  const stats = {} as AdminDashboardStats;
  for (const key of statisticKeys) {
    const metric = value.stats[key];
    if (metric !== null && (typeof metric !== 'number' || !Number.isInteger(metric) || metric < 0)) {
      throw new AdminAuthError('Dashboard service returned invalid statistics.', 502);
    }
    if (metric === undefined) {
      throw new AdminAuthError('Dashboard service omitted a required statistic.', 502);
    }
    stats[key] = metric;
  }

  if (!isRecord(value.unavailable) || !Array.isArray(value.recent_activity)) {
    throw new AdminAuthError('Dashboard service returned an invalid response.', 502);
  }
  const unavailable: Record<string, string> = {};
  for (const [key, reason] of Object.entries(value.unavailable)) {
    if (typeof reason !== 'string') {
      throw new AdminAuthError('Dashboard service returned invalid availability details.', 502);
    }
    unavailable[key] = reason;
  }
  const recent_activity = value.recent_activity.map((activity): AdminDashboardActivity => {
    if (
      !isRecord(activity) ||
      typeof activity.id !== 'number' ||
      typeof activity.action !== 'string' ||
      !(typeof activity.entity === 'string' || activity.entity === null) ||
      typeof activity.created_at !== 'string'
    ) {
      throw new AdminAuthError('Dashboard service returned invalid activity data.', 502);
    }
    return {
      id: activity.id,
      action: activity.action,
      entity: activity.entity,
      created_at: activity.created_at
    };
  });

  return { admin_id: value.admin_id, stats, unavailable, recent_activity };
}

async function request(path: string, method: 'GET' | 'POST', accessToken?: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new AdminAuthError(
      response.ok
        ? 'Authentication service returned an invalid response.'
        : `Request failed (${response.status})`,
      response.ok ? 502 : response.status
    );
  }
  if (!response.ok) {
    const errorBody = isRecord(responseBody) ? responseBody : {};
    const message = typeof errorBody.detail === 'string'
      ? errorBody.detail
      : typeof errorBody.message === 'string'
        ? errorBody.message
        : `Request failed (${response.status})`;
    throw new AdminAuthError(message, response.status);
  }
  return responseBody;
}

export const AdminAuthAPI = {
  async login(admin_id: string, password: string): Promise<AdminTokenResponse> {
    return parseTokenResponse(await request('/admin/login', 'POST', undefined, { admin_id, password }));
  },

  async changePassword(new_password: string, accessToken: string): Promise<AdminTokenResponse> {
    return parseTokenResponse(await request('/admin/change-password', 'POST', accessToken, { new_password }));
  },

  async logout(accessToken: string): Promise<{ status: string }> {
    const response = await request('/auth/logout', 'POST', accessToken, {});
    if (!isRecord(response) || response.status !== 'logged_out') {
      throw new AdminAuthError('Authentication service returned an invalid logout response.', 502);
    }
    return { status: 'logged_out' };
  },

  async getDashboard(accessToken: string): Promise<AdminDashboardSummary> {
    return parseDashboardResponse(await request('/admin/dashboard', 'GET', accessToken));
  }
};
