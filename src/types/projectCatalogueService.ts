import { ProjectDTO } from './types';
import { supabase } from '../utils/supabase/client';

export class ProjectCatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectCatalogueError';
  }
}

export const useMockCatalogue = false;

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

const CATEGORY_THEMES: Record<string, string> = {
  'Web Development': 'from-indigo-600 via-blue-600 to-cyan-500',
  'Artificial Intelligence': 'from-emerald-600 via-teal-600 to-cyan-600',
  'Machine Learning': 'from-violet-600 via-purple-600 to-indigo-600',
  'Internet of Things': 'from-amber-600 via-orange-600 to-yellow-500',
  'Android Development': 'from-blue-600 via-cyan-600 to-teal-500',
  'Cybersecurity': 'from-rose-600 via-pink-600 to-red-500',
  'Data Science': 'from-teal-600 via-emerald-600 to-green-500',
  'Cloud Computing': 'from-sky-600 via-indigo-600 to-blue-500'
};

function mapProject(value: unknown): ProjectDTO {
  if (!isRecord(value)) {
    throw new ProjectCatalogueError('Catalogue service returned an invalid project.');
  }
  const id = String(value.id || Math.random());
  const projectCode = typeof value.project_code === 'string' && value.project_code ? value.project_code : `PRJ-${id}`;
  const title = typeof value.title === 'string' ? value.title : 'Untitled Project';
  const topicName = typeof value.topic_name === 'string' ? value.topic_name : title;
  const category = typeof value.category === 'string' ? value.category : 'General';
  const projectType = typeof value.project_type === 'string' ? value.project_type : 'Web Application';
  const shortDescription = typeof value.short_description === 'string' ? value.short_description : '';
  const price = typeof value.price === 'number' ? value.price : Number(value.price) || 0;
  const publicationStatus = typeof value.publication_status === 'string' ? value.publication_status.toUpperCase() : 'PUBLISHED';

  const soldOut = publicationStatus === 'SOLD_OUT' || publicationStatus === 'SOLD';
  const hasPpt = value.has_ppt === true;
  const rawDiff = String(value.difficulty).toUpperCase();
  const difficulty: ProjectDTO['difficulty'] =
    rawDiff === 'BEGINNER'
      ? 'Beginner'
      : rawDiff === 'ADVANCED'
        ? 'Advanced'
        : 'Intermediate';

  const theme = CATEGORY_THEMES[category] || 'from-indigo-600 via-purple-600 to-pink-500';

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
    featureCategories: Array.isArray(value.feature_categories)
      ? value.feature_categories.filter((f): f is string => typeof f === 'string')
      : splitList(value.feature_categories),
    deliverables: Array.isArray(value.deliverables)
      ? value.deliverables.filter((d): d is string => typeof d === 'string')
      : splitList(value.deliverables),
    previewEligible: hasPpt && !soldOut,
    hasPpt,
    availability: soldOut ? 'SOLD_OUT' : 'ACTIVE',
    price,
    genericPatternTheme: theme,
    pptSlides: []
  };
}

/**
 * Dynamically fetch public project catalogue from Supabase projects table
 */
export async function getPublicProjects(): Promise<ProjectDTO[]> {
  // 1. Live query to Supabase projects table
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('id', { ascending: false });

    if (!error && Array.isArray(data)) {
      try {
        localStorage.setItem('cpm_admin_catalog', JSON.stringify(data));
      } catch {
        /* ignore */
      }
      return data.map(mapProject);
    }
  } catch (err) {
    console.warn('Supabase projects query warning:', err);
  }

  // 2. Offline fallback from localStorage if network unreachable
  try {
    const raw = localStorage.getItem('cpm_admin_catalog');
    if (raw) {
      const localProjects = JSON.parse(raw);
      if (Array.isArray(localProjects)) {
        return localProjects.map(mapProject);
      }
    }
  } catch {
    /* ignore */
  }

  return [];
}
