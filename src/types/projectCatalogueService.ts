import { ProjectDTO } from './types';
import { INITIAL_PROJECTS } from './mockData';
import { supabase } from '../utils/supabase/client';

export class ProjectCatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectCatalogueError';
  }
}

export const useMockCatalogue =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API !== 'false';

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

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function mapProject(value: unknown): ProjectDTO {
  if (!isRecord(value)) {
    throw new ProjectCatalogueError('Catalogue service returned an invalid project.');
  }
  const id = String(value.id || Math.random());
  const projectCode = typeof value.project_code === 'string' ? value.project_code : `PRJ-${id}`;
  const title = typeof value.title === 'string' ? value.title : 'Untitled Project';
  const topicName = typeof value.topic_name === 'string' ? value.topic_name : title;
  const category = typeof value.category === 'string' ? value.category : 'General';
  const projectType = typeof value.project_type === 'string' ? value.project_type : 'Web Application';
  const shortDescription = typeof value.short_description === 'string' ? value.short_description : '';
  const price = typeof value.price === 'number' ? value.price : Number(value.price) || 0;
  const publicationStatus = typeof value.publication_status === 'string' ? value.publication_status : 'PUBLISHED';

  const soldOut = publicationStatus === 'SOLD_OUT';
  const hasPpt = value.has_ppt === true;
  const rawDiff = String(value.difficulty).toUpperCase();
  const difficulty: ProjectDTO['difficulty'] =
    rawDiff === 'BEGINNER'
      ? 'Beginner'
      : rawDiff === 'ADVANCED'
        ? 'Advanced'
        : 'Intermediate';
  return {
    id,
    projectCode,
    topicName,
    title,
    category,
    projectType,
    shortDescription,
    problemStatement: typeof value.problem_statement === 'string' ? value.problem_statement : '',
    technologies: splitList(value.technology_stack),
    difficulty,
    suitableBranches: splitList(value.suitable_courses),
    featureCategories: [],
    deliverables: splitList(value.deliverables),
    previewEligible: hasPpt && !soldOut,
    hasPpt,
    availability: soldOut ? 'SOLD_OUT' : 'ACTIVE',
    price,
    genericPatternTheme: 'from-indigo-600 via-blue-600 to-cyan-500',
    pptSlides: []
  };
}

export async function getPublicProjects(): Promise<ProjectDTO[]> {
  // 1. Try Supabase projects table
  try {
    const { data, error } = await supabase.from('projects').select('*').order('id', { ascending: false });
    if (!error && data && data.length > 0) {
      return data.map(mapProject);
    }
  } catch {
    /* fallback */
  }

  // 2. Check localStorage (cpm_admin_catalog)
  try {
    const raw = localStorage.getItem('cpm_admin_catalog');
    if (raw) {
      const localProjects = JSON.parse(raw);
      if (Array.isArray(localProjects) && localProjects.length > 0) {
        return localProjects.map(mapProject);
      }
    }
  } catch {
    /* fallback */
  }

  // 3. Try backend API if not in mock mode
  if (!useMockCatalogue) {
    try {
      const response = await fetch(`${API_BASE_URL}/projects?page=1&page_size=100`);
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload) && payload.length > 0) {
          return payload.map(mapProject);
        }
      }
    } catch {
      /* fallback */
    }
  }

  // 4. Default fallback: initial sample projects
  return INITIAL_PROJECTS;
}
