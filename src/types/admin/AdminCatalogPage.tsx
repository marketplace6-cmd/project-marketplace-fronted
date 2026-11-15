import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Check,
  CheckCircle2,
  Code2,
  FileText,
  FolderKanban,
  GraduationCap,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  AdminCatalogAPI,
  AdminCatalogError,
  AdminProject,
  AdminProjectInput,
  AdminProjectList,
  CatalogueStatus
} from '../adminCatalogService';
import { supabase } from '../../utils/supabase/client';

interface AdminCatalogPageProps {
  accessToken: string;
  onSessionExpired: () => void;
  onChanged?: () => void;
}

const emptyCatalogue: AdminProjectList = {
  items: [],
  total: 0,
  total_projects: 0,
  active_projects: 0,
  sold_out_projects: 0
};

const emptyForm: AdminProjectInput = {
  topic_name: '',
  title: '',
  category: 'Final Year Capstone',
  project_type: 'Web Development',
  short_description: '',
  problem_statement: '',
  difficulty: 'INTERMEDIATE',
  technology_stack: '',
  suitable_courses: '',
  price: 1499,
  publication_status: 'PUBLISHED'
};

const STANDARD_CATEGORIES = [
  'Final Year Capstone',
  'Major Project',
  'Minor Project',
  'Mini Project',
  'Research Project',
  'Industrial Internship Project'
];

const STANDARD_PROJECT_TYPES = [
  'Web Development',
  'Artificial Intelligence',
  'Machine Learning',
  'Internet of Things',
  'Android Development',
  'Cybersecurity',
  'Data Science',
  'Cloud Computing'
];

const SUGGESTED_FEATURES = [
  'Role-Based Access Control (RBAC)',
  'Interactive Analytics Dashboard & Charts',
  'Real-Time Shortage & Activity Alerts',
  'Automated PDF/CSV Report Exporter',
  'Secure Payment Gateway Integration',
  'RESTful API Architecture & JWT Auth',
  'Candidate Resume & NLP Matching',
  'Responsive Student & Mentor Workspaces'
];

const SUGGESTED_TECH = [
  'React.js',
  'FastAPI',
  'Python',
  'TypeScript',
  'SQLite',
  'TailwindCSS',
  'PostgreSQL',
  'Node.js',
  'Express',
  'MongoDB',
  'Docker',
  'Scikit-Learn',
  'TensorFlow',
  'Flutter'
];

const SUGGESTED_COURSES = [
  'BCA',
  'B.Tech CSE',
  'MCA',
  'B.Sc IT',
  'B.Tech AI/ML',
  'B.Tech ECE',
  'M.Tech',
  'M.Sc Data Science'
];

const SUGGESTED_DELIVERABLES = [
  'Complete Source Code (Frontend & Backend)',
  'IEEE Research Paper & Synopsis (60+ Pages)',
  'System Architecture & UML Diagrams',
  'Project Presentation Slides (PPT / PPTX)',
  'Database Schema & SQL Dump File',
  'Complete Setup & Step-by-Step Execution Guide',
  '1-on-1 Viva & Defense Q&A Sheet'
];

const statusNames: Record<CatalogueStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Active',
  SOLD_OUT: 'Sold Out'
};

function statusStyle(status: CatalogueStatus) {
  if (status === 'PUBLISHED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 border border-emerald-100';
  if (status === 'SOLD_OUT') return 'bg-slate-100 text-slate-700 ring-slate-200 border border-slate-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200 border border-amber-100';
}

function difficultyBadge(difficulty: string) {
  const d = (difficulty || '').toUpperCase();
  if (d === 'BEGINNER') {
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold';
  }
  if (d === 'ADVANCED') {
    return 'bg-purple-50 text-purple-700 ring-1 ring-purple-200 font-semibold';
  }
  return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-semibold';
}

type FormTab = 'basic' | 'problem_features' | 'technical' | 'deliverables_preview';

export default function AdminCatalogPage({ accessToken, onSessionExpired, onChanged }: AdminCatalogPageProps) {
  const [catalogue, setCatalogue] = useState<AdminProjectList>(emptyCatalogue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [projectType, setProjectType] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTab>('basic');
  const [editing, setEditing] = useState<AdminProject | null>(null);
  const [form, setForm] = useState<AdminProjectInput>(emptyForm);
  const [problemStatement, setProblemStatement] = useState('');
  const [featureList, setFeatureList] = useState<string[]>([]);
  const [newFeatureInput, setNewFeatureInput] = useState('');
  const [techStackList, setTechStackList] = useState<string[]>([]);
  const [newTechInput, setNewTechInput] = useState('');
  const [coursesList, setCoursesList] = useState<string[]>([]);
  const [newCourseInput, setNewCourseInput] = useState('');
  const [deliverablesList, setDeliverablesList] = useState<string[]>([]);
  const [newDeliverableInput, setNewDeliverableInput] = useState('');
  const [presentation, setPresentation] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState<AdminProject | null>(null);
  const [deletingProject, setDeletingProject] = useState<AdminProject | null>(null);
  const [actionError, setActionError] = useState('');

  const loadCatalogue = useCallback(
    () => AdminCatalogAPI.list(accessToken, {
      search: search.trim(),
      category,
      projectType,
      status,
      page
    }),
    [accessToken, category, page, projectType, search, status]
  );

  const refreshCatalogue = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadCatalogue();
      setError('');
      setCatalogue(result);
    } catch (requestError) {
      if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load catalogue projects.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadCatalogue, onSessionExpired]);

  useEffect(() => {
    let active = true;
    void loadCatalogue()
      .then((result) => {
        if (active) {
          setError('');
          setCatalogue(result);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
          onSessionExpired();
        } else {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load catalogue projects.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadCatalogue, onSessionExpired]);

  // Real-time Supabase subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-projects-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          void refreshCatalogue();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshCatalogue]);

  // Listen for local catalogue update events
  useEffect(() => {
    const handleUpdate = () => {
      void refreshCatalogue();
    };
    window.addEventListener('uvikart-catalogue-updated', handleUpdate);
    return () => {
      window.removeEventListener('uvikart-catalogue-updated', handleUpdate);
    };
  }, [refreshCatalogue]);

  const categories = useMemo(() => {
    const fromList = catalogue.items.map((project) => project.category);
    return Array.from(new Set([...STANDARD_CATEGORIES, ...fromList])).filter(Boolean).sort();
  }, [catalogue.items]);

  const projectTypes = useMemo(() => {
    const fromList = catalogue.items.map((project) => project.project_type);
    return Array.from(new Set([...STANDARD_PROJECT_TYPES, ...fromList])).filter(Boolean).sort();
  }, [catalogue.items]);

  const filteredItems = useMemo(() => {
    return catalogue.items.filter((item) => {
      if (difficultyFilter && item.difficulty.toUpperCase() !== difficultyFilter.toUpperCase()) {
        return false;
      }
      return true;
    });
  }, [catalogue.items, difficultyFilter]);

  const openCreateForm = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      category: 'Final Year Capstone',
      project_type: 'Web Development',
      difficulty: 'INTERMEDIATE',
      price: 1499,
      publication_status: 'PUBLISHED'
    });
    setProblemStatement('');
    setFeatureList([
      'Role-Based Access Control (RBAC)',
      'Interactive Analytics Dashboard',
      'Automated PDF/CSV Report Exporter'
    ]);
    setTechStackList(['React.js', 'FastAPI', 'Python', 'SQLite', 'TailwindCSS']);
    setCoursesList(['BCA', 'B.Tech CSE', 'MCA']);
    setDeliverablesList([
      'Complete Source Code (Frontend & Backend)',
      'IEEE Research Paper & Synopsis (60+ Pages)',
      'System Architecture & UML Diagrams',
      'Project Presentation Slides (PPT / PPTX)'
    ]);
    setPresentation(null);
    setActiveTab('basic');
    setFormOpen(true);
    setError('');
    setActionError('');
  };

  const openEditForm = (project: AdminProject) => {
    setEditing(project);
    setForm({
      topic_name: project.topic_name,
      title: project.title,
      category: project.category,
      project_type: project.project_type,
      short_description: project.short_description,
      difficulty: project.difficulty,
      technology_stack: project.technology_stack,
      suitable_courses: project.suitable_courses,
      price: project.price,
      publication_status: project.publication_status === 'SOLD_OUT' ? 'SOLD_OUT' : (project.publication_status || 'PUBLISHED')
    });
    setProblemStatement(project.problem_statement || '');
    setFeatureList(
      project.feature_categories && project.feature_categories.length > 0
        ? project.feature_categories
        : [
            'Role-Based Access Control',
            'Interactive Analytics Charts',
            'Automated Report Exporter'
          ]
    );
    setTechStackList(
      project.technology_stack
        ? project.technology_stack.split(',').map((t) => t.trim()).filter(Boolean)
        : ['React.js', 'Python']
    );
    setCoursesList(
      project.suitable_courses
        ? project.suitable_courses.split(',').map((c) => c.trim()).filter(Boolean)
        : ['BCA', 'B.Tech CSE']
    );
    setDeliverablesList(
      project.deliverables && project.deliverables.length > 0
        ? project.deliverables
        : [
            'Complete Source Code',
            'Project Synopsis & IEEE Report',
            'Presentation PPT',
            'Setup Guide'
          ]
    );
    setPresentation(null);
    setActiveTab('basic');
    setFormOpen(true);
    setError('');
    setActionError('');
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: AdminProjectInput = {
        title: form.title.trim(),
        topic_name: (form.topic_name || form.title).trim(),
        category: form.category.trim() || 'Major Project',
        project_type: form.project_type.trim() || 'Web Development',
        short_description: form.short_description.trim(),
        problem_statement: problemStatement.trim(),
        feature_categories: featureList,
        deliverables: deliverablesList,
        difficulty: form.difficulty,
        technology_stack: techStackList.join(', '),
        suitable_courses: coursesList.join(', '),
        price: Number(form.price) || 0,
        publication_status: form.publication_status
      };

      if (editing) {
        await AdminCatalogAPI.update(accessToken, editing.id, payload);
        setNotice(`Project "${payload.title}" updated successfully.`);
      } else {
        await AdminCatalogAPI.create(accessToken, payload, presentation);
        setNotice(`Project "${payload.title}" added to the catalogue and live for students.`);
      }

      setFormOpen(false);
      setPresentation(null);
      await refreshCatalogue();
      if (onChanged) onChanged();
    } catch (requestError) {
      if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the project.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSoldOut = async () => {
    if (!confirming) return;
    setSaving(true);
    setActionError('');
    try {
      await AdminCatalogAPI.markSoldOut(accessToken, confirming.id);
      setNotice(confirming.publication_status === 'SOLD_OUT'
        ? `Presentation cleanup completed for ${confirming.project_code}.`
        : `${confirming.project_code} is now marked Sold Out.`);
      setConfirming(null);
      await refreshCatalogue();
      if (onChanged) onChanged();
    } catch (requestError) {
      if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setActionError(requestError instanceof Error ? requestError.message : 'Unable to complete the Sold Out action.');
      await refreshCatalogue();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingProject) return;
    setSaving(true);
    setActionError('');
    try {
      await AdminCatalogAPI.delete(accessToken, deletingProject.id);
      setNotice(`Project ${deletingProject.project_code} deleted permanently from database and cache.`);
      setDeletingProject(null);
      await refreshCatalogue();
      if (onChanged) onChanged();
    } catch (requestError) {
      if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      const msg = requestError instanceof Error ? requestError.message : 'Unable to delete project.';
      setActionError(msg);
      setError(msg);
      await refreshCatalogue();
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof AdminProjectInput>(key: K, value: AdminProjectInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const addFeature = (feature: string) => {
    const trimmed = feature.trim();
    if (trimmed && !featureList.includes(trimmed)) {
      setFeatureList((prev) => [...prev, trimmed]);
    }
    setNewFeatureInput('');
  };

  const removeFeature = (index: number) => {
    setFeatureList((prev) => prev.filter((_, i) => i !== index));
  };

  const addTech = (tech: string) => {
    const trimmed = tech.trim();
    if (trimmed && !techStackList.includes(trimmed)) {
      setTechStackList((prev) => [...prev, trimmed]);
    }
    setNewTechInput('');
  };

  const removeTech = (tech: string) => {
    setTechStackList((prev) => prev.filter((t) => t !== tech));
  };

  const toggleCourse = (course: string) => {
    if (coursesList.includes(course)) {
      setCoursesList((prev) => prev.filter((c) => c !== course));
    } else {
      setCoursesList((prev) => [...prev, course]);
    }
  };

  const addDeliverable = (deliverable: string) => {
    const trimmed = deliverable.trim();
    if (trimmed && !deliverablesList.includes(trimmed)) {
      setDeliverablesList((prev) => [...prev, trimmed]);
    }
    setNewDeliverableInput('');
  };

  const removeDeliverable = (index: number) => {
    setDeliverablesList((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-5">
      {/* Top Header & Add New Project Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <FolderKanban size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Manage Catalogue Projects</h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Publish academic capstones, update feature sets, tech stacks, deliverables, and preview assets for students.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus size={18} />
          <span>Add New Project</span>
        </button>
      </div>

      {/* Metric Cards Bar */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Total Projects', value: catalogue.total_projects, icon: FileText, style: 'bg-indigo-50 text-indigo-700' },
          { label: 'Active Projects', value: catalogue.active_projects, icon: CheckCircle2, style: 'bg-emerald-50 text-emerald-700' },
          { label: 'Draft & Sold Out', value: catalogue.sold_out_projects, icon: Archive, style: 'bg-slate-100 text-slate-700' }
        ].map((metric) => (
          <article key={metric.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{metric.value}</p>
            </div>
            <span className={`rounded-xl p-3 ${metric.style}`}><metric.icon size={20} /></span>
          </article>
        ))}
      </div>

      {/* Notifications & Error Banners */}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-700 hover:text-emerald-900"><X size={15} /></button>
        </div>
      )}
      {error && !formOpen && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
          <span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span>
          <button type="button" onClick={() => void refreshCatalogue()} className="font-semibold underline">Retry</button>
        </div>
      )}

      {/* Search & Multi-Filter Bar */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search by title, project ID, tech stack</span>
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setLoading(true);
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Search project title, ID, or tech stack..."
            className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => { setLoading(true); setPage(1); setCategory(event.target.value); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map((val) => <option key={val} value={val}>{val}</option>)}
        </select>
        <select
          aria-label="Filter by project type"
          value={projectType}
          onChange={(event) => { setLoading(true); setPage(1); setProjectType(event.target.value); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="">All Types</option>
          {projectTypes.map((val) => <option key={val} value={val}>{val}</option>)}
        </select>
        <select
          aria-label="Filter by difficulty"
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="">All Difficulties</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => { setLoading(true); setPage(1); setStatus(event.target.value); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="PUBLISHED">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="SOLD_OUT">Sold Out</option>
        </select>
      </div>

      {/* Projects Table View */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-6" aria-label="Loading projects">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText size={32} className="mx-auto text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-800">
              {catalogue.items.length === 0 ? 'No projects published yet' : 'No catalogue projects found'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {catalogue.items.length === 0
                ? "No projects published yet. Click '+ Add New Project' to add your first academic project."
                : 'Try adjusting your filters or click "+ Add New Project" to create one.'}
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
            >
              <Plus size={15} /> + Add New Project
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Project Title</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Difficulty Level</th>
                  <th className="px-4 py-3.5">Tech Stack</th>
                  <th className="px-4 py-3.5">Price</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((project) => {
                  const techList = project.technology_stack
                    ? project.technology_stack.split(',').map((t) => t.trim()).filter(Boolean)
                    : [];
                  return (
                    <tr key={project.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Project Title & Code */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="flex items-start gap-2.5">
                          <span className="shrink-0 mt-0.5 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 border border-slate-200">
                            {project.project_code}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight text-xs sm:text-sm line-clamp-1">{project.title}</p>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{project.topic_name || project.short_description}</p>
                          </div>
                        </div>
                      </td>

                      {/* Category & Project Type */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {project.category}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{project.project_type}</p>
                      </td>

                      {/* Difficulty Level */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide ${difficultyBadge(project.difficulty)}`}>
                          {project.difficulty}
                        </span>
                      </td>

                      {/* Tech Stack Chips */}
                      <td className="px-4 py-3.5 max-w-[240px]">
                        <div className="flex flex-wrap gap-1">
                          {techList.slice(0, 3).map((tech) => (
                            <span key={tech} className="inline-block rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[10px] font-medium border border-indigo-100/60">
                              {tech}
                            </span>
                          ))}
                          {techList.length > 3 && (
                            <span className="inline-block rounded-md bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px] font-medium">
                              +{techList.length - 3}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900 text-xs">
                        ₹{Number(project.price).toLocaleString('en-IN')}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle(project.publication_status)}`}>
                          {statusNames[project.publication_status] || project.publication_status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditForm(project)}
                            title="Edit Project"
                            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirming(project); setActionError(''); }}
                            title={project.publication_status === 'SOLD_OUT' ? 'Sold Out State' : 'Mark Sold Out'}
                            className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <Archive size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeletingProject(project); setActionError(''); }}
                            title="Delete Project"
                            className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Add / Edit Project Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="my-6 w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  {editing ? <Pencil size={18} /> : <Plus size={20} />}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {editing ? `Edit Project: ${editing.project_code}` : 'Add New Catalogue Project'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editing ? 'Update details, features, technical stack, and deliverables.' : 'Fill in the structured academic info to publish this project.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 overflow-x-auto text-xs font-semibold">
              {[
                { id: 'basic', label: '1. Basic Info', icon: FolderKanban },
                { id: 'problem_features', label: '2. Problem & Features', icon: Sparkles },
                { id: 'technical', label: '3. Technical Stack', icon: Code2 },
                { id: 'deliverables_preview', label: '4. Deliverables & Preview', icon: PackageCheck }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as FormTab)}
                    className={`flex items-center gap-2 py-3 px-4 border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-indigo-600 text-indigo-700 bg-white font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <tab.icon size={15} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body & Forms */}
            <form onSubmit={submitForm} className="flex-1 overflow-y-auto p-6 space-y-5">
              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* TAB 1: BASIC INFO */}
              {activeTab === 'basic' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                      Project Title <span className="text-rose-500">*</span>
                      <input
                        required
                        minLength={3}
                        maxLength={255}
                        value={form.title}
                        onChange={(e) => setField('title', e.target.value)}
                        placeholder="e.g. Smart Campus Attendance & Academic Analytics Portal"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Topic Name / Academic Short Name
                      <input
                        maxLength={255}
                        value={form.topic_name}
                        onChange={(e) => setField('topic_name', e.target.value)}
                        placeholder="e.g. Campus Attendance Tracker"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Category <span className="text-rose-500">*</span>
                      <select
                        value={form.category}
                        onChange={(e) => setField('category', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        {STANDARD_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Project Type <span className="text-rose-500">*</span>
                      <select
                        value={form.project_type}
                        onChange={(e) => setField('project_type', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        {STANDARD_PROJECT_TYPES.map((pt) => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Difficulty Level <span className="text-rose-500">*</span>
                      <select
                        value={form.difficulty}
                        onChange={(e) => setField('difficulty', e.target.value as AdminProjectInput['difficulty'])}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="BEGINNER">Beginner (1st - 2nd Year)</option>
                        <option value="INTERMEDIATE">Intermediate (3rd Year / Pre-Final)</option>
                        <option value="ADVANCED">Advanced (Final Year / Capstone)</option>
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Price in INR (₹) <span className="text-rose-500">*</span>
                      <input
                        required
                        type="number"
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={(e) => setField('price', Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      Publication Status
                      <select
                        value={form.publication_status}
                        onChange={(e) => setField('publication_status', e.target.value as AdminProjectInput['publication_status'])}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="PUBLISHED">Active (Visible to Students)</option>
                        <option value="DRAFT">Draft (Admin Only)</option>
                        {editing && <option value="SOLD_OUT">Sold Out</option>}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                      Short Description <span className="text-rose-500">*</span>
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        value={form.short_description}
                        onChange={(e) => setField('short_description', e.target.value)}
                        placeholder="Provide an engaging summary for students browsing the project catalogue..."
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                      <span className="block text-right text-[10px] text-slate-400 mt-1">
                        {form.short_description.length} / 2000 characters
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: PROBLEM STATEMENT & FEATURES */}
              {activeTab === 'problem_features' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold text-slate-700">
                    General Problem Statement
                    <textarea
                      rows={4}
                      value={problemStatement}
                      onChange={(e) => setProblemStatement(e.target.value)}
                      placeholder="Describe the real-world challenge, existing limitations, and the core motivation behind this project..."
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>

                  <div>
                    <span className="block text-xs font-semibold text-slate-700">Dynamic Feature Categories & Key Modules</span>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Add bullet points of major features and functional capabilities included in this project.
                    </p>

                    <div className="flex gap-2">
                      <input
                        value={newFeatureInput}
                        onChange={(e) => setNewFeatureInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addFeature(newFeatureInput);
                          }
                        }}
                        placeholder="Type a feature (e.g. Automated Email Alerts) and press Enter..."
                        className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => addFeature(newFeatureInput)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Add Feature
                      </button>
                    </div>

                    {/* Active Feature Chips */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {featureList.map((feature, idx) => (
                        <span
                          key={feature}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-800"
                        >
                          <Sparkles size={13} className="text-indigo-600" />
                          <span>{feature}</span>
                          <button
                            type="button"
                            onClick={() => removeFeature(idx)}
                            className="rounded-full p-0.5 hover:bg-indigo-200 text-indigo-700"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Quick Suggestions */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                        Quick Feature Suggestions (Click to Add):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_FEATURES.filter((f) => !featureList.includes(f)).map((suggested) => (
                          <button
                            key={suggested}
                            type="button"
                            onClick={() => addFeature(suggested)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                          >
                            <Plus size={11} /> {suggested}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TECHNICAL DETAILS */}
              {activeTab === 'technical' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Tech Stack Tags */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-700">Technology Stack Tags <span className="text-rose-500">*</span></span>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Libraries, frameworks, databases, and languages utilized in this capstone.
                    </p>

                    <div className="flex gap-2">
                      <input
                        value={newTechInput}
                        onChange={(e) => setNewTechInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTech(newTechInput);
                          }
                        }}
                        placeholder="Type a technology (e.g. Next.js, PyTorch) and press Enter..."
                        className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => addTech(newTechInput)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Add Tech
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {techStackList.map((tech) => (
                        <span
                          key={tech}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                        >
                          <Code2 size={13} />
                          <span>{tech}</span>
                          <button
                            type="button"
                            onClick={() => removeTech(tech)}
                            className="rounded-full p-0.5 hover:bg-indigo-200 text-indigo-700"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Quick Tech Suggestions */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                        Popular Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_TECH.filter((t) => !techStackList.includes(t)).map((tech) => (
                          <button
                            key={tech}
                            type="button"
                            onClick={() => addTech(tech)}
                            className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                          >
                            + {tech}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Suitable Academic Courses */}
                  <div className="pt-4 border-t border-slate-200">
                    <span className="block text-xs font-semibold text-slate-700">Suitable Academic Courses & Departments</span>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Select or add degree courses where this project fits the academic syllabus.
                    </p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {SUGGESTED_COURSES.map((course) => {
                        const selected = coursesList.includes(course);
                        return (
                          <button
                            key={course}
                            type="button"
                            onClick={() => toggleCourse(course)}
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors border ${
                              selected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {selected ? <Check size={13} /> : <GraduationCap size={13} />}
                            {course}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <input
                        value={newCourseInput}
                        onChange={(e) => setNewCourseInput(e.target.value)}
                        placeholder="Add custom course (e.g. Diploma in CS)..."
                        className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCourseInput.trim()) {
                            toggleCourse(newCourseInput.trim());
                            setNewCourseInput('');
                          }
                        }}
                        className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        + Add Course
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DELIVERABLES & PREVIEW */}
              {activeTab === 'deliverables_preview' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Deliverables Checklist */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-700">List of Deliverables Upon Purchase</span>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Items students will receive directly after approval / purchase.
                    </p>

                    <div className="flex gap-2">
                      <input
                        value={newDeliverableInput}
                        onChange={(e) => setNewDeliverableInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addDeliverable(newDeliverableInput);
                          }
                        }}
                        placeholder="Type a deliverable (e.g. Video Walkthrough Guide) and press Enter..."
                        className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => addDeliverable(newDeliverableInput)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Add Item
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {deliverablesList.map((item, idx) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs text-slate-800 font-medium"
                        >
                          <span className="flex items-center gap-2">
                            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            <span>{item}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDeliverable(idx)}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Presets */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                        Common Academic Deliverables:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_DELIVERABLES.filter((d) => !deliverablesList.includes(d)).map((deliv) => (
                          <button
                            key={deliv}
                            type="button"
                            onClick={() => addDeliverable(deliv)}
                            className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                          >
                            + {deliv}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Presentation File Upload */}
                  <div className="pt-4 border-t border-slate-200">
                    <span className="block text-xs font-semibold text-slate-700">Project Presentation File (PPT, PPTX, PDF)</span>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Allows verified students to view presentation slide previews on Uvikart before scheduling meetings.
                    </p>

                    <div className="mt-2 flex items-center gap-3">
                      <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 text-xs font-medium text-slate-600 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all">
                        <Upload size={18} className="text-indigo-600" />
                        <span>{presentation ? presentation.name : 'Upload Presentation Deck (.pdf, .ppt, .pptx — max 20 MB)'}</span>
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          onChange={(e) => setPresentation(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                      {presentation && (
                        <button
                          type="button"
                          onClick={() => setPresentation(null)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-6">
                <div className="flex gap-2">
                  {activeTab !== 'basic' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === 'deliverables_preview') setActiveTab('technical');
                        else if (activeTab === 'technical') setActiveTab('problem_features');
                        else if (activeTab === 'problem_features') setActiveTab('basic');
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                  )}
                  {activeTab !== 'deliverables_preview' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === 'basic') setActiveTab('problem_features');
                        else if (activeTab === 'problem_features') setActiveTab('technical');
                        else if (activeTab === 'technical') setActiveTab('deliverables_preview');
                      }}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Next Step →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {saving && <LoaderCircle size={15} className="animate-spin" />}
                    {editing ? 'Save Changes' : 'Publish Project'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 size={22} />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-slate-900">
              Delete Project Permanently?
            </h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-600">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-900">{deletingProject.project_code} ({deletingProject.title})</span>? This project will be removed from the catalogue and student explorer.
            </p>
            {actionError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingProject(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {saving ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Sold Out Confirmation Dialog */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Archive size={22} />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-slate-900">
              {confirming.publication_status === 'SOLD_OUT' ? 'Sold Out Cleanup' : 'Mark Project as Sold Out?'}
            </h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-600">
              {confirming.publication_status === 'SOLD_OUT'
                ? `The project is already marked Sold Out. Retry presentation cleanup for ${confirming.project_code}?`
                : `${confirming.project_code} will be marked as Sold Out. It will no longer be available for student booking.`}
            </p>
            {actionError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmSoldOut()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {confirming.publication_status === 'SOLD_OUT' ? 'Retry Cleanup' : 'Confirm Sold Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
