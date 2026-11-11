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
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.project_code !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.project_type !== 'string' ||
    typeof value.short_description !== 'string' ||
    typeof value.difficulty !== 'string' ||
    typeof value.price !== 'number' ||
    typeof value.publication_status !== 'string'
  ) {
    throw new ProjectCatalogueError('Catalogue service returned an invalid project.');
  }
  const soldOut = value.publication_status === 'SOLD_OUT';
  const hasPpt = value.has_ppt === true;
  const difficulty: ProjectDTO['difficulty'] =
    value.difficulty === 'BEGINNER'
      ? 'Beginner'
      : value.difficulty === 'ADVANCED'
        ? 'Advanced'
        : 'Intermediate';
  return {
    id: String(value.id),
    projectCode: value.project_code,
    topicName: typeof value.topic_name === 'string' ? value.topic_name : value.title,
    title: value.title,
    category: value.category,
    projectType: value.project_type,
    shortDescription: value.short_description,
    problemStatement: typeof value.problem_statement === 'string' ? value.problem_statement : '',
    technologies: splitList(value.technology_stack),
    difficulty,
    suitableBranches: splitList(value.suitable_courses),
    featureCategories: [],
    deliverables: splitList(value.deliverables),
    previewEligible: hasPpt && !soldOut,
    hasPpt,
    availability: soldOut ? 'SOLD_OUT' : 'ACTIVE',
    price: value.price,
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
    /* fallback to API or mock */
  }

  if (useMockCatalogue) return INITIAL_PROJECTS;

  const projects: ProjectDTO[] = [];
  let page = 1;
  while (true) {
    const response = await fetch(`${API_BASE_URL}/projects?page=${page}&page_size=100`);
    if (!response.ok) {
      throw new ProjectCatalogueError(`Unable to load the project catalogue (${response.status}).`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProjectCatalogueError('Catalogue service returned an invalid response.');
    }
    if (!Array.isArray(payload)) {
      throw new ProjectCatalogueError('Catalogue service returned an invalid project list.');
    }
    projects.push(...payload.map(mapProject));
    if (payload.length < 100) break;
    page += 1;
  }
  return projects;
}
