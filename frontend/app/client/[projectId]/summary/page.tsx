"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProject, getProjectStages } from "@/lib/api";
import ProjectSummary from "@/components/ProjectSummary";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ClientSummaryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [stages, setStages] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    Promise.all([getProject(projectId), getProjectStages(projectId)]).then(([proj, stgs]) => {
      setProject(proj);
      setStages(stgs);
      if (proj.status !== "complete") router.replace(`/client/${projectId}`);
    });
  }, [projectId, router]);

  if (!project) {
    return (
      <div className="space-y-4 animate-pulse mt-4">
        <div className="h-8 w-48 bg-slate-200 rounded-xl" />
        <div className="h-48 bg-slate-100 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/client/${projectId}`}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to project
      </Link>

      <ProjectSummary project={project as never} stages={stages as never[]} role="client" />
    </div>
  );
}
