import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { FolderKanban } from "lucide-react";

export default async function ClientHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await supabase
    .from("client_project_access")
    .select("project_id")
    .eq("client_id", user.id);

  const ids = (access.data ?? []).map((r: Record<string, string>) => r.project_id);

  const { data: projects } = ids.length
    ? await supabase.from("projects").select("*").in("id", ids).order("created_at", { ascending: false })
    : { data: [] };

  if (!projects?.length) {
    return (
      <div className="text-center py-20 text-slate-400">
        <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-slate-600">No projects assigned yet</p>
        <p className="text-sm mt-1">Your presales team will share documents with you here</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Your Projects</h1>
      <div className="space-y-3">
        {projects.map((project: Record<string, unknown>) => (
          <Link
            key={String(project.id)}
            href={`/client/${project.id}`}
            className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200/80 px-6 py-5 shadow-sm hover:shadow-md hover:border-blue-200 transition group"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition">{String(project.name)}</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[String(project.status)]}`}>
                  {STATUS_LABELS[String(project.status)]}
                </span>
              </div>
              <p className="text-sm text-slate-500">View documents and provide feedback</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
