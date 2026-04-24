"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listProjects, deleteProject } from "@/lib/api";
import { Plus, FolderKanban, Clock, CheckCircle2, AlertCircle, Trash2, Loader2 } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  client_email: string | null;
  status: string;
  updated_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-card delete state: null = idle, id = confirming that card, `${id}-deleting` = in-flight
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault(); // prevent card Link navigation
    e.stopPropagation();
    setDeletingId(id);
    setConfirmId(null);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // Fallback: navigate to the project page which will show the error
      router.push(`/dashboard/${id}`);
    } finally {
      setDeletingId(null);
    }
  }

  function requestConfirm(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setConfirmId(id);
  }

  function cancelConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirmId(null);
  }

  const counts = {
    total: projects.length,
    running: projects.filter((p) => p.status === "running").length,
    review: projects.filter((p) => p.status === "awaiting_review").length,
    complete: projects.filter((p) => p.status === "complete").length,
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your presales pipeline</p>
        </div>
        <Link
          href="/dashboard/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition shadow-sm shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total", value: counts.total, icon: FolderKanban, color: "text-slate-600 bg-slate-100" },
          { label: "Running", value: counts.running, icon: Clock, color: "text-blue-600 bg-blue-50" },
          { label: "In Review", value: counts.review, icon: AlertCircle, color: "text-yellow-600 bg-yellow-50" },
          { label: "Complete", value: counts.complete, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <div className={`inline-flex p-2 rounded-xl ${color} mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{loading ? "—" : value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading projects…</span>
        </div>
      ) : !projects.length ? (
        <div className="text-center py-20 text-slate-400">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const isConfirming = confirmId === project.id;
            const isDeleting = deletingId === project.id;

            return (
              <div key={project.id} className="relative group">
                <Link
                  href={`/dashboard/${project.id}`}
                  className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200/80 px-6 py-4 shadow-sm hover:shadow-md hover:border-blue-200 transition group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition truncate">
                        {project.name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {project.client_name || "—"}
                      {project.client_email ? ` · ${project.client_email}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </p>

                    {/* Delete action — shown on hover or when confirming */}
                    {isConfirming ? (
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.preventDefault()}
                      >
                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                        <button
                          onClick={(e) => handleDelete(e, project.id)}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition"
                        >
                          Yes
                        </button>
                        <button
                          onClick={cancelConfirm}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
                        >
                          No
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <button
                        onClick={(e) => requestConfirm(e, project.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
