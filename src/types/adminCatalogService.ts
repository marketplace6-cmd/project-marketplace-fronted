export type CatalogueStatus = 'DRAFT' | 'PUBLISHED' | 'SOLD_OUT';

export interface AdminProject {
  id: number;
  project_code: string;
  topic_name: string;
  title: string;
  category: string;
  project_type: string;
  short_description: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  technology_stack: string;
  suitable_courses: string;
  price: number;
  publication_status: CatalogueStatus;
  has_ppt: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminProjectList {
  items: AdminProject[];
  total: number;
  total_projects: number;
  active_projects: number;
  sold_out_projects: number;
}

export interface AdminProjectInput {
  topic_name: string;
  title: string;
  category: string;
  project_type: string;
  short_description: string;
  difficulty: AdminProject['difficulty'];
  technology_stack: string;
  suitable_courses: string;
  price: number;
  publication_status: 'PUBLISHED' | 'SOLD_OUT';
}

export class AdminCatalogError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminCatalogError';
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

function isProjectStatus(value: unknown): value is CatalogueStatus {
  return value === 'DRAFT' || value === 'PUBLISHED' || value === 'SOLD_OUT';
}

function parseProject(value: unknown): AdminProject {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.project_code !== 'string' ||
    typeof value.topic_name !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.project_type !== 'string' ||
    typeof value.short_description !== 'string' ||
    (value.difficulty !== 'BEGINNER' && value.difficulty !== 'INTERMEDIATE' && value.difficulty !== 'ADVANCED') ||
    typeof value.technology_stack !== 'string' ||
    typeof value.suitable_courses !== 'string' ||
    typeof value.price !== 'number' ||
    !isProjectStatus(value.publication_status) ||
    typeof value.has_ppt !== 'boolean' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    throw new AdminCatalogError('Catalogue service returned an invalid project.', 502);
  }
  return {
    id: value.id,
    project_code: value.project_code,
    topic_name: value.topic_name,
    title: value.title,
    category: value.category,
    project_type: value.project_type,
    short_description: value.short_description,
    difficulty: value.difficulty,
    technology_stack: value.technology_stack,
    suitable_courses: value.suitable_courses,
    price: value.price,
    publication_status: value.publication_status,
    has_ppt: value.has_ppt,
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

function parseProjectList(value: unknown): AdminProjectList {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    typeof value.total !== 'number' ||
    typeof value.total_projects !== 'number' ||
    typeof value.active_projects !== 'number' ||
    typeof value.sold_out_projects !== 'number'
  ) {
    throw new AdminCatalogError('Catalogue service returned an invalid project list.', 502);
  }
  return {
    items: value.items.map(parseProject),
    total: value.total,
    total_projects: value.total_projects,
    active_projects: value.active_projects,
    sold_out_projects: value.sold_out_projects
  };
}

async function request(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    if (!response.ok) {
      throw new AdminCatalogError(`Request failed (${response.status})`, response.status);
    }
    throw new AdminCatalogError('Catalogue service returned an invalid response.', 502);
  }

  if (!response.ok) {
    const body = isRecord(responseBody) ? responseBody : {};
    const detail = typeof body.detail === 'string'
      ? body.detail
      : `Request failed (${response.status})`;
    throw new AdminCatalogError(detail, response.status);
  }
  return responseBody;
}

export const AdminCatalogAPI = {
  list(
    accessToken: string,
    filters: { search?: string; category?: string; projectType?: string; status?: string; page: number }
  ): Promise<AdminProjectList> {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.category) query.set('category', filters.category);
    if (filters.projectType) query.set('project_type', filters.projectType);
    if (filters.status) query.set('status', filters.status);
    query.set('page', String(filters.page));
    query.set('page_size', '50');
    return request(`/admin/projects?${query.toString()}`, accessToken).then(parseProjectList);
  },

  async create(accessToken: string, fields: AdminProjectInput, presentation: File | null): Promise<AdminProject> {
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => body.append(key, String(value)));
    if (presentation) body.append('presentation', presentation);
    return parseProject(await request('/admin/projects', accessToken, { method: 'POST', body }));
  },

  async update(accessToken: string, projectId: number, fields: Partial<AdminProjectInput>): Promise<AdminProject> {
    const { publication_status: _ignored, ...editableFields } = fields;
    return parseProject(await request(`/admin/projects/${projectId}`, accessToken, {
      method: 'PUT',
      body: JSON.stringify(editableFields)
    }));
  },

  async markSoldOut(accessToken: string, projectId: number): Promise<AdminProject> {
    return parseProject(await request(`/admin/projects/${projectId}/sold-out`, accessToken, {
      method: 'POST',
      body: JSON.stringify({})
    }));
  }
};
