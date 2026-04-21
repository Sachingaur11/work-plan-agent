import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Plus, FolderKanban, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  const counts = {
    total: projects?.length ?? 0,
    running: projects?.filter((p) => p.status === "running").length ?? 0,
    review: projects?.filter((p) => p.status === "awaiting_review").length ?? 0,
    complete: projects?.filter((p) => p.status === "complete").length ?? 0,
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
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Project list */}
      {!projects?.length ? (
        <div className="text-center py-20 text-slate-400">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
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
                  {project.client_name || "—"}{project.client_email ? ` · ${project.client_email}` : ""}
                </p>
              </div>
              <p className="text-xs text-slate-400 shrink-0">
                {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
