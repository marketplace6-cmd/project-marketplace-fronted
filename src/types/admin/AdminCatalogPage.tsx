import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, CheckCircle2, FileText, LoaderCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
  category: '',
  project_type: '',
  short_description: '',
  difficulty: 'BEGINNER',
  technology_stack: '',
  suitable_courses: '',
  price: 0,
  publication_status: 'PUBLISHED'
};

const statusNames: Record<CatalogueStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Active',
  SOLD_OUT: 'Sold Out'
};

function statusStyle(status: CatalogueStatus) {
  if (status === 'PUBLISHED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'SOLD_OUT') return 'bg-slate-100 text-slate-700 ring-slate-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200';
}

export default function AdminCatalogPage({ accessToken, onSessionExpired }: AdminCatalogPageProps) {
  const [catalogue, setCatalogue] = useState<AdminProjectList>(emptyCatalogue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [projectType, setProjectType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProject | null>(null);
  const [form, setForm] = useState<AdminProjectInput>(emptyForm);
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

  const refreshCatalogue = async () => {
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
  };

  const categories = useMemo(
    () => Array.from(new Set(catalogue.items.map((project) => project.category))).sort(),
    [catalogue.items]
  );
  const projectTypes = useMemo(
    () => Array.from(new Set(catalogue.items.map((project) => project.project_type))).sort(),
    [catalogue.items]
  );

  const openCreateForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setPresentation(null);
    setFormOpen(true);
    setError('');
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
      publication_status: project.publication_status === 'SOLD_OUT' ? 'SOLD_OUT' : 'PUBLISHED'
    });
    setPresentation(null);
    setFormOpen(true);
    setError('');
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editing) {
        await AdminCatalogAPI.update(accessToken, editing.id, form);
        setNotice('Project details updated.');
      } else {
        await AdminCatalogAPI.create(accessToken, form, presentation);
        setNotice('Project added to the catalogue.');
      }
      setFormOpen(false);
      setPresentation(null);
      setLoading(true);
      await refreshCatalogue();
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
        ? `Private presentation cleanup completed for ${confirming.project_code}.`
        : `${confirming.project_code} is now Sold Out.`);
      setConfirming(null);
      setLoading(true);
      await refreshCatalogue();
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
      setNotice(`Project ${deletingProject.project_code} deleted successfully.`);
      setDeletingProject(null);
      setLoading(true);
      await refreshCatalogue();
    } catch (requestError) {
      if (requestError instanceof AdminCatalogError && (requestError.status === 401 || requestError.status === 403)) {
        onSessionExpired();
        return;
      }
      setActionError(requestError instanceof Error ? requestError.message : 'Unable to delete project.');
      await refreshCatalogue();
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof AdminProjectInput>(key: K, value: AdminProjectInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manage Catalogue Projects</h2>
          <p className="mt-1 text-sm text-slate-500">Manage published listings and their private presentation files.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Add New Project
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Total Projects', value: catalogue.total_projects, icon: FileText, style: 'bg-indigo-50 text-indigo-700' },
          { label: 'Active Projects', value: catalogue.active_projects, icon: CheckCircle2, style: 'bg-emerald-50 text-emerald-700' },
          { label: 'Sold Out Projects', value: catalogue.sold_out_projects, icon: Archive, style: 'bg-slate-100 text-slate-700' }
        ].map((metric) => (
          <article key={metric.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{metric.value}</p>
            </div>
            <span className={`rounded-lg p-2.5 ${metric.style}`}><metric.icon size={18} /></span>
          </article>
        ))}
      </div>

      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && !formOpen && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span>
          <button type="button" onClick={() => void refreshCatalogue()} className="font-semibold underline">Retry</button>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search by project name or ID</span>
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => { setLoading(true); setPage(1); setSearch(event.target.value); }} placeholder="Search project name or ID"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <select aria-label="Filter by category" value={category} onChange={(event) => { setLoading(true); setPage(1); setCategory(event.target.value); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All categories</option>
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter by project type" value={projectType} onChange={(event) => { setLoading(true); setPage(1); setProjectType(event.target.value); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All project types</option>
          {projectTypes.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(event) => { setLoading(true); setPage(1); setStatus(event.target.value); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="PUBLISHED">Active</option>
          <option value="SOLD_OUT">Sold Out</option>
          <option value="DRAFT">Draft</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading projects">
            {[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : catalogue.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText size={28} className="mx-auto text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-800">No catalogue projects found</h3>
            <p className="mt-1 text-sm text-slate-500">Try changing the filters or add a new project.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  {['Project ID', 'Project Name', 'Topic Name', 'Category', 'Project Type', 'Price', 'Suitable Courses', 'Status', 'PPT', 'Actions'].map((column) => (
                    <th key={column} className="border-b border-slate-200 px-3 py-3 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogue.items.map((project) => (
                  <tr key={project.id} className="text-slate-700">
                    <td className="px-3 py-3 font-mono font-semibold text-slate-900">{project.project_code}</td>
                    <td className="max-w-48 px-3 py-3 font-semibold text-slate-900">{project.title}</td>
                    <td className="max-w-40 px-3 py-3">{project.topic_name}</td>
                    <td className="px-3 py-3">{project.category}</td>
                    <td className="px-3 py-3">{project.project_type}</td>
                    <td className="whitespace-nowrap px-3 py-3">₹{project.price.toLocaleString('en-IN')}</td>
                    <td className="max-w-40 px-3 py-3">{project.suitable_courses}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${statusStyle(project.publication_status)}`}>
                        {statusNames[project.publication_status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 ${project.has_ppt ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <FileText size={14} />{project.has_ppt ? 'Available' : 'No file'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {project.publication_status !== 'SOLD_OUT' && (
                          <button type="button" onClick={() => openEditForm(project)} title="Edit project" aria-label={`Edit ${project.project_code}`}
                            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil size={14} /></button>
                        )}
                        {(project.publication_status !== 'SOLD_OUT' || project.has_ppt) && (
                          <button type="button" onClick={() => { setConfirming(project); setActionError(''); }} title={project.publication_status === 'SOLD_OUT' ? 'Retry private presentation cleanup' : 'Mark Sold Out'} aria-label={`${project.publication_status === 'SOLD_OUT' ? 'Retry presentation cleanup for' : 'Mark'} ${project.project_code} ${project.publication_status === 'SOLD_OUT' ? '' : 'sold out'}`}
                            className="rounded-md p-2 text-rose-600 hover:bg-rose-50"><Archive size={14} /></button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setDeletingProject(project); setActionError(''); }}
                          title="Delete project"
                          aria-label={`Delete ${project.project_code}`}
                          className="rounded-md p-2 text-rose-600 hover:bg-rose-100 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {catalogue.total > 50 && (
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, catalogue.total)} of {catalogue.total}</span>
                          <div className="flex gap-2">
                            <button type="button" disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage((current) => current - 1); }}
                              className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-40">Previous</button>
                            <button type="button" disabled={page * 50 >= catalogue.total || loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}
                              className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-40">Next</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center">
          <form onSubmit={submitForm} className="my-4 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Project' : 'Add New Project'}</h3>
                <p className="mt-1 text-xs text-slate-500">{editing ? editing.project_code : 'Project ID is generated by the backend after saving.'}</p>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">Topic Name<input required minLength={2} maxLength={255} value={form.topic_name} onChange={(event) => setField('topic_name', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Project Name<input required minLength={2} maxLength={255} value={form.title} onChange={(event) => setField('title', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Category<input required value={form.category} onChange={(event) => setField('category', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Project Type<input required value={form.project_type} onChange={(event) => setField('project_type', event.target.value)} placeholder="Web App, Android App, AI/ML..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Suitable Courses<input required value={form.suitable_courses} onChange={(event) => setField('suitable_courses', event.target.value)} placeholder="BCA, B.Sc IT, B.Tech CSE" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Technology Stack<input required value={form.technology_stack} onChange={(event) => setField('technology_stack', event.target.value)} placeholder="React, Python, MySQL" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Difficulty<select value={form.difficulty} onChange={(event) => setField('difficulty', event.target.value as AdminProjectInput['difficulty'])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select></label>
              <label className="text-xs font-semibold text-slate-700">Price (INR)<input required type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={(event) => setField('price', Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-slate-700">Status<select value={form.publication_status} onChange={(event) => setField('publication_status', event.target.value as AdminProjectInput['publication_status'])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"><option value="PUBLISHED">Active</option><option value="SOLD_OUT">Sold Out</option></select></label>
              {!editing && <label className="text-xs font-semibold text-slate-700">Presentation (PDF, PPT, PPTX; max 20 MB)<input type="file" disabled={form.publication_status === 'SOLD_OUT'} accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setPresentation(event.target.files?.[0] || null)} className="mt-1 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 disabled:opacity-50" /></label>}
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Short Description<textarea required minLength={5} maxLength={2000} rows={3} value={form.short_description} onChange={(event) => setField('short_description', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    const toDelete = editing;
                    setFormOpen(false);
                    setDeletingProject(toDelete);
                    setActionError('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 size={15} /> Delete Project
                </button>
              ) : <div />}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving && <LoaderCircle size={15} className="animate-spin" />}{editing ? 'Save Changes' : 'Add Project'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {deletingProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-project-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Trash2 size={20} /></div>
            <h3 id="delete-project-title" className="mt-4 text-center text-lg font-bold text-slate-900">
              Delete Project?
            </h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-600">
              Are you sure you want to permanently delete <span className="font-semibold text-slate-800">{deletingProject.project_code} ({deletingProject.title})</span>? This project will be completely removed from the catalogue. This action cannot be undone.
            </p>
            {actionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setDeletingProject(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void confirmDelete()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {saving ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="sold-out-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Archive size={20} /></div>
            <h3 id="sold-out-title" className="mt-4 text-center text-lg font-bold text-slate-900">
              {confirming.publication_status === 'SOLD_OUT' ? 'Retry presentation cleanup?' : 'Mark project Sold Out?'}
            </h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-600">
              {confirming.publication_status === 'SOLD_OUT'
                ? `The project is already Sold Out. Retry permanent deletion of its private presentation for ${confirming.project_code}?`
                : `${confirming.project_code} will be unavailable for new previews and purchases. Its private presentation will be permanently deleted. This cannot be undone.`}
            </p>
            {actionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void confirmSoldOut()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{confirming.publication_status === 'SOLD_OUT' ? 'Retry Removal' : 'Confirm Sold Out'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
