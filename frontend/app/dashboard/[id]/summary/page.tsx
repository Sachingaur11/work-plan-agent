"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProject, getProjectStages } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import ProjectSummary from "@/components/ProjectSummary";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ProjectSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [stages, setStages] = useState<Record<string, unknown>[]>([]);
  const [role, setRole] = useState("presales");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
        if (profile) setRole(profile.role);
      }
    })();

    Promise.all([getProject(id), getProjectStages(id)]).then(([proj, stgs]) => {
      setProject(proj);
      setStages(stgs);
      // Only redirect if stage 4 has never been run — summary has nothing to show.
      // We intentionally allow access when status is "awaiting_review" (e.g. after
      // a regeneration) so the user can still review the existing outputs.
      const hasStage4 = (stgs as Record<string, unknown>[]).some(
        (s) => s.stage_number === 4
      );
      if (!hasStage4) router.replace(`/dashboard/${id}`);
    });
  }, [id, router]);

  if (!project) {
    return (
      <div className="p-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-slate-200 rounded-xl" />
          <div className="h-48 bg-slate-100 rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link
        href={`/dashboard/${id}`}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <ProjectSummary project={project as never} stages={stages as never[]} role={role} />
    </div>
  );
}
