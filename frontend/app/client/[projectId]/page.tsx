"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProject, getProjectStages, getStageDocuments, listFeedback, listApprovals } from "@/lib/api";
import DocumentViewer from "@/components/DocumentViewer";
import FeedbackThread from "@/components/FeedbackThread";
import ClientDownloads from "@/components/ClientDownloads";
import { STATUS_LABELS, STATUS_COLORS, STAGE_NAMES } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const STAGES = [1, 2, 3];

export default function ClientProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [stages, setStages] = useState<Record<string, unknown>[]>([]);
  const [activeStage, setActiveStage] = useState(1);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [feedback, setFeedback] = useState<Record<string, unknown>[]>([]);
  const [stageApprovals, setStageApprovals] = useState<Record<number, boolean>>({});

  const loadStageData = useCallback(async (stage: number) => {
    const [docs, fb] = await Promise.all([
      getStageDocuments(projectId, stage),
      listFeedback(projectId, stage),
    ]);
    setDocuments(docs);
    setFeedback(fb);
  }, [projectId]);

  useEffect(() => {
    getProject(projectId).then(setProject);
    getProjectStages(projectId).then(setStages);
    // Check which stages are approved
    Promise.all(STAGES.map((n) => listApprovals(projectId, n))).then((results) => {
      const map: Record<number, boolean> = {};
      results.forEach((appvs, i) => {
        map[i + 1] = (appvs as Record<string, unknown>[]).some((a) => a.decision === "approved");
      });
      setStageApprovals(map);
    });
  }, [projectId]);

  useEffect(() => { loadStageData(activeStage); }, [activeStage, loadStageData]);

  return (
    <div>
      <Link href="/client" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6">
        <ArrowLeft className="w-4 h-4" />
        All projects
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{project ? String(project.name) : "…"}</h1>
        {project && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[String(project.status)]}`}>
            {STATUS_LABELS[String(project.status)]}
          </span>
        )}
      </div>

      {/* Downloads card */}
      <ClientDownloads projectId={projectId} stageApprovals={stageApprovals} />

      {/* Stage tabs */}
      <div className="flex gap-2 mb-6 mt-6">
        {STAGES.map((n) => (
          <button
            key={n}
            onClick={() => setActiveStage(n)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              activeStage === n
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-blue-300"
            } ${!stageApprovals[n] ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={!stageApprovals[n]}
          >
            {STAGE_NAMES[n]}
            {stageApprovals[n] && <span className="ml-2 text-xs opacity-70">✓</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <DocumentViewer documents={documents as never[]} role="client" />
        </div>
        <div>
          <FeedbackThread
            projectId={projectId}
            stageNumber={activeStage}
            feedback={feedback as never[]}
            role="client"
            onFeedbackAdded={() => loadStageData(activeStage)}
          />
        </div>
      </div>

      {/* View Summary button if complete */}
      {project && String(project.status) === "complete" && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => router.push(`/client/${projectId}/summary`)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/20 transition"
          >
            View Project Summary
          </button>
        </div>
      )}
    </div>
  );
}
