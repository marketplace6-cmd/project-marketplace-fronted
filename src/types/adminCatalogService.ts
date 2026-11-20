import { supabase } from '../utils/supabase/client';

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
  ppt_preview_url?: string;
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
  ppt_preview_url?: string;
  has_ppt?: boolean;
}

export class AdminCatalogError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminCatalogError';
  }
}

const configuredBaseUrl = (import.meta.env.VITE_ADMIN_API_BASE_URL || '')
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
    has_ppt: Boolean(value.has_ppt || value.ppt_preview_url),
    ppt_preview_url: typeof value.ppt_preview_url === 'string' ? value.ppt_preview_url : '',
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
    window.dispatchEvent(new CustomEvent('unikart-catalogue-updated'));
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
    // 1. Live Query directly from Supabase
    try {
      let sbQuery = supabase.from('projects').select('*', { count: 'exact' });
      if (filters.category) sbQuery = sbQuery.eq('category', filters.category);
      if (filters.projectType) sbQuery = sbQuery.eq('project_type', filters.projectType);
      if (filters.status) sbQuery = sbQuery.eq('publication_status', filters.status);
      if (filters.search) {
        sbQuery = sbQuery.or(`title.ilike.%${filters.search}%,project_code.ilike.%${filters.search}%,topic_name.ilike.%${filters.search}%`);
      }

      const { data, count, error } = await sbQuery.order('id', { ascending: false });
      if (error) {
        console.error('Failed to load projects from Supabase:', error);
        throw new AdminCatalogError(`Database error loading catalogue: ${error.message}`, 500);
      }

      if (Array.isArray(data)) {
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
          has_ppt: Boolean(d.has_ppt || d.ppt_preview_url || d.ppt_url),
          ppt_preview_url: d.ppt_preview_url || d.ppt_url || '',
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
    } catch (err: any) {
      if (err instanceof AdminCatalogError) throw err;
      throw new AdminCatalogError(err?.message || 'Failed to load projects from database.', 500);
    }

    return {
      items: [],
      total: 0,
      total_projects: 0,
      active_projects: 0,
      sold_out_projects: 0
    };
  },

  async uploadPresentation(file: File, projectCode?: string): Promise<string> {
    const cleanFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `${projectCode || 'project'}/${cleanFileName}`;

    const { data, error } = await supabase.storage
      .from('project-presentations')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      throw new AdminCatalogError(`Presentation upload failed: ${error.message}`, 400);
    }

    const { data: publicUrlData } = supabase.storage
      .from('project-presentations')
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  },

  async create(accessToken: string, fields: AdminProjectInput, presentation: File | null): Promise<AdminProject> {
    const nextCode = `PRJ-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    let pptPreviewUrl = fields.ppt_preview_url || '';
    if (presentation) {
      pptPreviewUrl = await AdminCatalogAPI.uploadPresentation(presentation, nextCode);
    }

    const insertPayload = {
      project_code: nextCode,
      topic_name: fields.topic_name,
      title: fields.title,
      category: fields.category,
      project_type: fields.project_type,
      short_description: fields.short_description,
      description: fields.short_description,
      problem_statement: fields.problem_statement || '',
      feature_categories: fields.feature_categories || [],
      deliverables: fields.deliverables || [],
      difficulty: fields.difficulty,
      technology_stack: fields.technology_stack,
      tech_stack: fields.technology_stack,
      suitable_courses: fields.suitable_courses,
      price: Number(fields.price) || 0,
      publication_status: fields.publication_status,
      status: fields.publication_status,
      has_ppt: Boolean(presentation || pptPreviewUrl || fields.has_ppt),
      ppt_preview_url: pptPreviewUrl
    };

    // 1. Direct Supabase insert FIRST - never hide errors in localStorage!
    const { data: inserted, error: insertErr } = await supabase
      .from('projects')
      .insert([insertPayload])
      .select();

    if (insertErr) {
      throw new AdminCatalogError(`Database insertion failed: ${insertErr.message}`, 400);
    }

    if (!inserted || inserted.length === 0) {
      throw new AdminCatalogError('Database did not return the created project.', 500);
    }

    const row = inserted[0];
    const newProject: AdminProject = {
      id: Number(row.id),
      project_code: row.project_code || nextCode,
      topic_name: row.topic_name || fields.topic_name,
      title: row.title || fields.title,
      category: row.category || fields.category,
      project_type: row.project_type || fields.project_type,
      short_description: row.short_description || fields.short_description,
      problem_statement: fields.problem_statement || '',
      feature_categories: fields.feature_categories || [],
      deliverables: fields.deliverables || [],
      difficulty: fields.difficulty,
      technology_stack: fields.technology_stack,
      suitable_courses: fields.suitable_courses,
      price: Number(fields.price) || 0,
      publication_status: fields.publication_status as CatalogueStatus,
      has_ppt: Boolean(row.has_ppt || pptPreviewUrl),
      ppt_preview_url: row.ppt_preview_url || pptPreviewUrl,
      created_at: row.created_at || now,
      updated_at: row.updated_at || now
    };

    // Update local cache and notify listeners AFTER successful database insert
    const existing = loadLocalCatalog();
    saveLocalCatalog([newProject, ...existing.filter((p) => p.id !== newProject.id)]);
    notifyCatalogChange();

    return newProject;
  },

  async update(
    accessToken: string,
    projectId: number,
    fields: Partial<AdminProjectInput>,
    presentation?: File | null
  ): Promise<AdminProject> {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (fields.title) { updatePayload.title = fields.title; updatePayload.topic_name = fields.title; }
    if (fields.topic_name) updatePayload.topic_name = fields.topic_name;
    if (fields.category) updatePayload.category = fields.category;
    if (fields.project_type) updatePayload.project_type = fields.project_type;
    if (fields.short_description) {
      updatePayload.short_description = fields.short_description;
      updatePayload.description = fields.short_description;
    }
    if (fields.problem_statement !== undefined) updatePayload.problem_statement = fields.problem_statement;
    if (fields.feature_categories !== undefined) updatePayload.feature_categories = fields.feature_categories;
    if (fields.deliverables !== undefined) updatePayload.deliverables = fields.deliverables;
    if (fields.difficulty) updatePayload.difficulty = fields.difficulty;
    if (fields.technology_stack) {
      updatePayload.technology_stack = fields.technology_stack;
      updatePayload.tech_stack = fields.technology_stack;
    }
    if (fields.suitable_courses) updatePayload.suitable_courses = fields.suitable_courses;
    if (fields.price !== undefined) updatePayload.price = Number(fields.price) || 0;
    if (fields.publication_status) {
      updatePayload.publication_status = fields.publication_status;
      updatePayload.status = fields.publication_status;
    }

    if (presentation) {
      const uploadedUrl = await AdminCatalogAPI.uploadPresentation(presentation, `PRJ-${projectId}`);
      updatePayload.ppt_preview_url = uploadedUrl;
      updatePayload.has_ppt = true;
    } else if (fields.ppt_preview_url !== undefined) {
      updatePayload.ppt_preview_url = fields.ppt_preview_url;
      if (fields.ppt_preview_url) {
        updatePayload.has_ppt = true;
      }
    }

    const { data: updatedRows, error: sbUpdateErr } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .select();

    if (sbUpdateErr) {
      throw new AdminCatalogError(`Database update failed: ${sbUpdateErr.message}`, 400);
    }

    const existing = loadLocalCatalog();
    const idx = existing.findIndex((p) => p.id === projectId);
    const row = updatedRows && updatedRows[0];
    const updatedProject: AdminProject = row
      ? {
          id: Number(row.id),
          project_code: row.project_code,
          topic_name: row.topic_name,
          title: row.title,
          category: row.category,
          project_type: row.project_type,
          short_description: row.short_description,
          problem_statement: row.problem_statement || '',
          feature_categories: Array.isArray(row.feature_categories) ? row.feature_categories : [],
          deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
          difficulty: row.difficulty,
          technology_stack: row.technology_stack,
          suitable_courses: row.suitable_courses,
          price: Number(row.price),
          publication_status: row.publication_status,
          has_ppt: Boolean(row.has_ppt || row.ppt_preview_url),
          ppt_preview_url: row.ppt_preview_url || '',
          created_at: row.created_at,
          updated_at: row.updated_at
        }
      : idx !== -1
      ? { ...existing[idx], ...updatePayload }
      : { id: projectId, ...updatePayload } as AdminProject;

    if (idx !== -1) {
      existing[idx] = updatedProject;
      saveLocalCatalog(existing);
    }
    notifyCatalogChange();

    return updatedProject;
  },

  async markSoldOut(accessToken: string, projectId: number): Promise<AdminProject> {
    const { data: updatedRows, error: sbSoldOutErr } = await supabase
      .from('projects')
      .update({
        publication_status: 'SOLD_OUT',
        status: 'SOLD_OUT',
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select();

    if (sbSoldOutErr) {
      throw new AdminCatalogError(`Database update failed: ${sbSoldOutErr.message}`, 400);
    }

    const existing = loadLocalCatalog();
    const idx = existing.findIndex((p) => p.id === projectId);
    const updated: AdminProject = (updatedRows && updatedRows[0])
      ? {
          id: Number(updatedRows[0].id),
          project_code: updatedRows[0].project_code,
          topic_name: updatedRows[0].topic_name,
          title: updatedRows[0].title,
          category: updatedRows[0].category,
          project_type: updatedRows[0].project_type,
          short_description: updatedRows[0].short_description,
          difficulty: updatedRows[0].difficulty,
          technology_stack: updatedRows[0].technology_stack,
          suitable_courses: updatedRows[0].suitable_courses,
          price: Number(updatedRows[0].price),
          publication_status: 'SOLD_OUT',
          has_ppt: Boolean(updatedRows[0].has_ppt),
          created_at: updatedRows[0].created_at,
          updated_at: updatedRows[0].updated_at
        }
      : idx !== -1
      ? { ...existing[idx], publication_status: 'SOLD_OUT', updated_at: new Date().toISOString() }
      : { id: projectId, publication_status: 'SOLD_OUT' } as AdminProject;

    if (idx !== -1) {
      existing[idx] = updated;
      saveLocalCatalog(existing);
    }
    notifyCatalogChange();

    return updated;
  },

  async delete(accessToken: string, projectId: number): Promise<void> {
    // Direct permanent delete in Supabase
    const { error: sbDeleteErr } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (sbDeleteErr) {
      throw new AdminCatalogError(
        `Database deletion failed: ${sbDeleteErr.message}`,
        500
      );
    }

    // Update localStorage cache with the exact remaining array (never reset to seed data)
    const existing = loadLocalCatalog();
    const remaining = existing.filter((p) => Number(p.id) !== Number(projectId));
    saveLocalCatalog(remaining);
    notifyCatalogChange();
  }
};
