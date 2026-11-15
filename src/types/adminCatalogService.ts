import { supabase } from '../utils/supabase/client';
import { INITIAL_PROJECTS } from './mockData';

export type CatalogueStatus = 'DRAFT' | 'PUBLISHED' | 'SOLD_OUT';

export interface AdminProject {
  id: number;
  project_code: string;
  topic_name: string;
  title: string;
  category: string;
  project_type: string;
  short_description: string;
  problem_statement?: string;
  feature_categories?: string[];
  deliverables?: string[];
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
  problem_statement?: string;
  feature_categories?: string[];
  deliverables?: string[];
  difficulty: AdminProject['difficulty'];
  technology_stack: string;
  suitable_courses: string;
  price: number;
  publication_status: 'PUBLISHED' | 'SOLD_OUT' | 'DRAFT';
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
    problem_statement: typeof value.problem_statement === 'string' ? value.problem_statement : '',
    feature_categories: Array.isArray(value.feature_categories) ? value.feature_categories : [],
    deliverables: Array.isArray(value.deliverables) ? value.deliverables : [],
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

// --- Local mock store ---
const LOCAL_CATALOG_KEY = 'cpm_admin_catalog';

function notifyCatalogChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('uvikart-catalogue-updated'));
  }
}

function loadLocalCatalog(): AdminProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }

  return [];
}

function saveLocalCatalog(items: AdminProject[]): void {
  try { localStorage.setItem(LOCAL_CATALOG_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

function makeLocalProject(fields: AdminProjectInput): AdminProject {
  const existing = loadLocalCatalog();
  const nextId = existing.length > 0 ? Math.max(...existing.map((p) => p.id)) + 1 : 1001;
  const now = new Date().toISOString();
  return {
    id: nextId,
    project_code: `PRJ-${nextId}`,
    topic_name: fields.topic_name,
    title: fields.title,
    category: fields.category,
    project_type: fields.project_type,
    short_description: fields.short_description,
    problem_statement: fields.problem_statement || '',
    feature_categories: fields.feature_categories || [],
    deliverables: fields.deliverables || [],
    difficulty: fields.difficulty,
    technology_stack: fields.technology_stack,
    suitable_courses: fields.suitable_courses,
    price: Number(fields.price),
    publication_status: fields.publication_status as CatalogueStatus,
    has_ppt: false,
    created_at: now,
    updated_at: now
  };
}

function filterLocalCatalog(
  items: AdminProject[],
  filters: { search?: string; category?: string; projectType?: string; status?: string }
): AdminProject[] {
  return items.filter((p) => {
    if (filters.search && !p.title.toLowerCase().includes(filters.search.toLowerCase()) &&
        !p.project_code.toLowerCase().includes(filters.search.toLowerCase()) &&
        !p.technology_stack.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.projectType && p.project_type !== filters.projectType) return false;
    if (filters.status && p.publication_status !== filters.status) return false;
    return true;
  });
}

export const AdminCatalogAPI = {
  async list(
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
    try {
      const serverList = await request(`/admin/projects?${query.toString()}`, accessToken).then(parseProjectList);
      if (serverList && serverList.items.length > 0) {
        return serverList;
      }
    } catch {
      // Fallback
    }

    // 1. Try Supabase
    try {
      let sbQuery = supabase.from('projects').select('*', { count: 'exact' });
      if (filters.category) sbQuery = sbQuery.eq('category', filters.category);
      if (filters.projectType) sbQuery = sbQuery.eq('project_type', filters.projectType);
      if (filters.status) sbQuery = sbQuery.eq('publication_status', filters.status);
      if (filters.search) {
        sbQuery = sbQuery.or(`title.ilike.%${filters.search}%,project_code.ilike.%${filters.search}%,topic_name.ilike.%${filters.search}%`);
      }

      const { data, count, error } = await sbQuery.order('id', { ascending: false });
      if (!error && Array.isArray(data)) {
        const items: AdminProject[] = data.map((d: any) => ({
          id: Number(d.id),
          project_code: d.project_code || `PRJ-${d.id}`,
          topic_name: d.topic_name || d.title,
          title: d.title,
          category: d.category,
          project_type: d.project_type,
          short_description: d.short_description || '',
          problem_statement: d.problem_statement || '',
          feature_categories: Array.isArray(d.feature_categories) ? d.feature_categories : [],
          deliverables: Array.isArray(d.deliverables) ? d.deliverables : [],
          difficulty: d.difficulty || 'BEGINNER',
          technology_stack: d.technology_stack || '',
          suitable_courses: d.suitable_courses || '',
          price: Number(d.price) || 0,
          publication_status: d.publication_status || 'PUBLISHED',
          has_ppt: Boolean(d.has_ppt),
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || new Date().toISOString()
        }));
        const total = count !== null ? count : items.length;
        const active = items.filter((p) => p.publication_status === 'PUBLISHED').length;
        const soldOut = items.filter((p) => p.publication_status === 'SOLD_OUT' || p.publication_status === 'SOLD').length;
        saveLocalCatalog(items);
        return {
          items,
          total,
          total_projects: total,
          active_projects: active,
          sold_out_projects: soldOut
        };
      }
    } catch {
      /* proceed to localStorage */
    }

    // 2. Offline fallback: use localStorage
    const all = loadLocalCatalog();
    const filtered = filterLocalCatalog(all, filters);
    const active = filtered.filter((p) => p.publication_status === 'PUBLISHED').length;
    const soldOut = filtered.filter((p) => p.publication_status === 'SOLD_OUT').length;
    return {
      items: filtered,
      total: filtered.length,
      total_projects: filtered.length,
      active_projects: active,
      sold_out_projects: soldOut
    };
  },

  async create(accessToken: string, fields: AdminProjectInput, presentation: File | null): Promise<AdminProject> {
    const newProject = makeLocalProject(fields);
    if (presentation) newProject.has_ppt = true;

    // Save to local catalog first for immediate response
    const existing = loadLocalCatalog();
    saveLocalCatalog([newProject, ...existing]);
    notifyCatalogChange();

    try {
      const body = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            body.append(key, value.join(', '));
          } else {
            body.append(key, String(value));
          }
        }
      });
      if (presentation) body.append('presentation', presentation);
      const serverRes = await request('/admin/projects', accessToken, { method: 'POST', body });
      const parsed = parseProject(serverRes);
      const updatedLocal = loadLocalCatalog().map((p) => (p.id === newProject.id ? { ...p, id: parsed.id, project_code: parsed.project_code } : p));
      saveLocalCatalog(updatedLocal);
      notifyCatalogChange();
      return parsed;
    } catch {
      try {
        const { data: inserted, error: insertErr } = await supabase.from('projects').insert([{
          project_code: newProject.project_code,
          topic_name: newProject.topic_name,
          title: newProject.title,
          category: newProject.category,
          project_type: newProject.project_type,
          short_description: newProject.short_description,
          difficulty: newProject.difficulty,
          technology_stack: newProject.technology_stack,
          suitable_courses: newProject.suitable_courses,
          price: newProject.price,
          publication_status: newProject.publication_status,
          has_ppt: Boolean(presentation)
        }]).select();

        if (!insertErr && inserted && inserted.length > 0) {
          const row = inserted[0];
          newProject.id = Number(row.id);
          newProject.project_code = row.project_code || newProject.project_code;
          const updatedLocal = loadLocalCatalog().map((p) => (p.id === newProject.id ? newProject : p));
          saveLocalCatalog(updatedLocal);
          notifyCatalogChange();
        }
      } catch {
        /* already in localStorage */
      }
      return newProject;
    }
  },

  async update(accessToken: string, projectId: number, fields: Partial<AdminProjectInput>): Promise<AdminProject> {
    const existing = loadLocalCatalog();
    const idx = existing.findIndex((p) => p.id === projectId);
    let updatedLocal: AdminProject | null = null;
    if (idx !== -1) {
      updatedLocal = {
        ...existing[idx],
        ...Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined)
        ),
        updated_at: new Date().toISOString()
      };
      existing[idx] = updatedLocal;
      saveLocalCatalog(existing);
      notifyCatalogChange();
    }

    try {
      const { publication_status: _ignored, ...editableFields } = fields;
      const serverRes = await request(`/admin/projects/${projectId}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify(editableFields)
      });
      const parsed = parseProject(serverRes);
      notifyCatalogChange();
      return parsed;
    } catch {
      try {
        const { problem_statement, feature_categories, deliverables, ...safeFields } = fields as any;
        await supabase.from('projects').update({
          ...safeFields,
          updated_at: new Date().toISOString()
        }).eq('id', projectId);
      } catch {
        /* ignore */
      }

      if (updatedLocal) return updatedLocal;
      throw new AdminCatalogError('Project not found.', 404);
    }
  },

  async markSoldOut(accessToken: string, projectId: number): Promise<AdminProject> {
    const existing = loadLocalCatalog();
    const idx = existing.findIndex((p) => p.id === projectId);
    let updated: AdminProject | null = null;
    if (idx !== -1) {
      existing[idx] = { ...existing[idx], publication_status: 'SOLD_OUT', updated_at: new Date().toISOString() };
      updated = existing[idx];
      saveLocalCatalog(existing);
      notifyCatalogChange();
    }

    try {
      const serverRes = await request(`/admin/projects/${projectId}/sold-out`, accessToken, {
        method: 'POST',
        body: JSON.stringify({})
      });
      notifyCatalogChange();
      return parseProject(serverRes);
    } catch {
      try {
        await supabase.from('projects').update({
          publication_status: 'SOLD_OUT',
          updated_at: new Date().toISOString()
        }).eq('id', projectId);
      } catch {
        /* ignore */
      }

      if (updated) return updated;
      throw new AdminCatalogError('Project not found.', 404);
    }
  },

  async delete(accessToken: string, projectId: number): Promise<void> {
    const existing = loadLocalCatalog();
    saveLocalCatalog(existing.filter((p) => p.id !== projectId));
    notifyCatalogChange();

    try {
      await request(`/admin/projects/${projectId}`, accessToken, {
        method: 'DELETE'
      });
    } catch {
      try {
        await supabase.from('projects').delete().eq('id', projectId);
      } catch {
        /* ignore */
      }
    }
  }
};
