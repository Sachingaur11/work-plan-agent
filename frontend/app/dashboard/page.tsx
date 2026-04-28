"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listProjects, deleteProject } from "@/lib/api";
import {
  Plus, FolderKanban, Clock, CheckCircle2, AlertCircle,
  Trash2, Loader2, Search, ArrowRight,
} from "lucide-react";
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

const STATUS_LEFT_BORDER: Record<string, string> = {
  running:            "bg-blue-500",
  awaiting_review:    "bg-amber-400",
  revision_requested: "bg-orange-400",
  approved:           "bg-emerald-500",
  complete:           "bg-emerald-600",
  rejected:           "bg-red-500",
  pending:            "bg-slate-300",
};

const STATUS_ICON_BG: Record<string, string> = {
  running:            "bg-blue-50 text-blue-600",
  awaiting_review:    "bg-amber-50 text-amber-600",
  revision_requested: "bg-orange-50 text-orange-600",
  approved:           "bg-emerald-50 text-emerald-600",
  complete:           "bg-emerald-50 text-emerald-700",
  rejected:           "bg-red-50 text-red-600",
  pending:            "bg-slate-100 text-slate-500",
};

const STAT_ACCENT: Record<string, string> = {
  total:    "from-slate-400 to-slate-500",
  running:  "from-blue-400 to-blue-600",
  review:   "from-amber-400 to-amber-500",
  complete: "from-emerald-400 to-emerald-600",
};

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      queryClient.setQueryData<Project[]>(["projects"], (old = []) =>
        old.filter((p) => p.id !== id)
      );
      setConfirmId(null);
      return { previous };
    },
    onSuccess: () => toast.success("Project deleted"),
    onError: (err: unknown, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["projects"], context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
      router.push("/dashboard");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    total:    projects.length,
    running:  projects.filter((p) => p.status === "running").length,
    review:   projects.filter((p) => p.status === "awaiting_review").length,
    complete: projects.filter((p) => p.status === "complete").length,
  };

  const stats = [
    { key: "total",    label: "Total",     value: counts.total,    icon: FolderKanban },
    { key: "running",  label: "Running",   value: counts.running,  icon: Clock        },
    { key: "review",   label: "In Review", value: counts.review,   icon: AlertCircle  },
    { key: "complete", label: "Complete",  value: counts.complete, icon: CheckCircle2 },
  ] as const;

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
        {stats.map(({ key, label, value, icon: Icon }) => (
          <div
            key={key}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm overflow-hidden relative"
          >
            <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${STAT_ACCENT[key]}`} />
            <div className={`inline-flex p-2 rounded-xl mb-3 ${
              key === "total"    ? "bg-slate-100 text-slate-600" :
              key === "running"  ? "bg-blue-50 text-blue-600" :
              key === "review"   ? "bg-amber-50 text-amber-600" :
                                   "bg-emerald-50 text-emerald-600"
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {isLoading ? <span className="skeleton inline-block h-7 w-8 rounded" /> : value}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search + list */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects or clients…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition"
            />
          </div>
          {search && (
            <p className="text-sm text-slate-400">
              {filtered.length} of {projects.length}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 px-6 py-4 flex items-center gap-4">
                <div className="skeleton h-10 w-10 rounded-xl shrink-0" />
                <div className="flex-1">
                  <div className="skeleton h-5 w-56 mb-2" />
                  <div className="skeleton h-4 w-36" />
                </div>
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !projects.length ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="inline-flex p-4 rounded-2xl bg-slate-50 mb-4">
              <FolderKanban className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700 mb-1">No projects yet</p>
            <p className="text-sm text-slate-400 mb-6">Create your first presales project to get started</p>
            <Link
              href="/dashboard/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No matches for &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          filtered.map((project) => {
            const isConfirming = confirmId === project.id;
            const isDeleting   = deleteMutation.isPending && deleteMutation.variables === project.id;
            const borderColor  = STATUS_LEFT_BORDER[project.status] ?? "bg-slate-300";
            const iconBg       = STATUS_ICON_BG[project.status] ?? "bg-slate-100 text-slate-500";

            return (
              <div key={project.id} className="relative group">
                {/* Left status accent */}
                <div className={`absolute left-0 inset-y-0 w-[3px] rounded-l-2xl ${borderColor}`} />

                <Link
                  href={`/dashboard/${project.id}`}
                  className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200/80 px-6 py-4 pl-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
                >
                  {/* Status icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    <FolderKanban className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-0.5">
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition truncate">
                        {project.name}
                      </h3>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 truncate">
                      {project.client_name
                        ? `${project.client_name}${project.client_email ? ` · ${project.client_email}` : ""}`
                        : "No client assigned"}
                    </p>
                  </div>

                  {/* Time + delete + arrow */}
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </p>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteMutation.mutate(project.id); }}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(null); }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
                        >
                          No
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(project.id); }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
