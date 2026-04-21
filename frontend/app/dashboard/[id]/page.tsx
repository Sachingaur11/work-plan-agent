"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import {
  getProject, getProjectStages, getStageDocuments, listFeedback,
  listApprovals, runPipeline, verifyDownload,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import PipelineTracker from "@/components/PipelineTracker";
import DocumentViewer from "@/components/DocumentViewer";
import FeedbackThread from "@/components/FeedbackThread";
import ApprovalBar from "@/components/ApprovalBar";
import { STATUS_LABELS, STATUS_COLORS, STAGE_NAMES } from "@/lib/utils";
import { ArrowLeft, Play, RotateCcw, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [stages, setStages] = useState<Record<string, unknown>[]>([]);
  const [activeStage, setActiveStage] = useState(1);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [feedback, setFeedback] = useState<Record<string, unknown>[]>([]);
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [role, setRole] = useState("presales");
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [verifyingStage, setVerifyingStage] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [proj, stgs] = await Promise.all([getProject(id), getProjectStages(id)]);
    setProject(proj);
    setStages(stgs);
  }, [id]);

  const refreshStageData = useCallback(async (stage: number) => {
    const [docs, fb, appv] = await Promise.all([
      getStageDocuments(id, stage),
      listFeedback(id, stage),
      listApprovals(id, stage),
    ]);
    setDocuments(docs);
    setFeedback(fb);
    setApprovals(appv);
  }, [id]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
        if (profile) setRole(profile.role);
      }
    })();
  }, []);

  // Poll every 5s while a stage is running, stop when complete/failed
  const startPolling = useCallback((stage: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      const [proj, stgs] = await Promise.all([getProject(id), getProjectStages(id)]);
      setProject(proj);
      setStages(stgs);
      const latestStage = (stgs as Record<string, unknown>[])
        .filter((s) => s.stage_number === stage)
        .sort((a, b) => (b.version as number) - (a.version as number))[0];
      if (latestStage?.status === "complete" || latestStage?.status === "failed") {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        setRunningStage(null);
        setVerifyingStage(null);
        refreshStageData(stage);
      }
    }, 5000);
  }, [id, refreshStageData]);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  useEffect(() => {
    refresh().then(() => {
      // Auto-resume polling if a stage is already running on page load
      getProjectStages(id).then((stgs) => {
        const running = (stgs as Record<string, unknown>[]).find((s) => s.status === "running");
        if (running) {
          setRunningStage(running.stage_number as number);
          startPolling(running.stage_number as number);
        }
      });
    });
  }, [refresh, id, startPolling]);
  useEffect(() => { refreshStageData(activeStage); }, [activeStage, refreshStageData]);

  // Supabase Realtime — live pipeline updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-${id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "pipeline_stages",
        filter: `project_id=eq.${id}`,
      }, () => { refresh(); refreshStageData(activeStage); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, activeStage, refresh, refreshStageData]);

  async function handleVerifyDownload(stage: number) {
    setVerifyingStage(stage);
    setError("");
    try {
      await verifyDownload(id, stage);
      startPolling(stage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setVerifyingStage(null);
    }
  }

  async function handleRunStage(stage: number, rerun = false) {
    setRunningStage(stage);
    setError("");
    try {
      await runPipeline(id, stage, rerun);
      startPolling(stage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setRunningStage(null);
    }
  }

  const stageMap = Object.fromEntries(stages.map((s: Record<string, unknown>) => [s.stage_number as number, s]));
  const activeStageData = stageMap[activeStage] as Record<string, unknown> | undefined;
  const latestApproval = (approvals as Record<string, unknown>[])[0];
  const openFeedbackCount = (feedback as Record<string, unknown>[]).filter((f) => !f.resolved).length;

  const canRunStage = (n: number) => {
    if (n === 1) return true;
    return (stages as Record<string, unknown>[]).some(
      (s) => s.stage_number === n - 1 && (
        (approvals as Record<string, unknown>[]).some((a) => a.stage_number === n - 1 && a.decision === "approved")
      )
    );
  };

  return (
    <div className="p-8">
      <Link href="/dashboard" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6">
        <ArrowLeft className="w-4 h-4" />
        All projects
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{project ? String(project.name) : "…"}</h1>
            {project && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[String(project.status)]}`}>
                {STATUS_LABELS[String(project.status)]}
              </span>
            )}
          </div>
          {project && (
            <p className="text-sm text-slate-500">
              {String(project.client_name || "")}
              {project.client_email ? ` · ${project.client_email}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Pipeline tracker */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-6 py-4 mb-6">
        <PipelineTracker
          stages={stages as never[]}
          activeStage={activeStage}
          onStageClick={setActiveStage}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stage content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Main: Documents */}
        <div className="col-span-2 space-y-4">
          {/* Stage action bar */}
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3">
            <h2 className="font-semibold text-slate-800">
              Stage {activeStage} — {STAGE_NAMES[activeStage]}
            </h2>
            {activeStageData && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                activeStageData.status === "complete" ? "bg-emerald-100 text-emerald-700"
                : activeStageData.status === "running" ? "bg-blue-100 text-blue-700"
                : activeStageData.status === "failed" ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
              }`}>
                {String(activeStageData.status)}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {role !== "client" && (
                <>
                  {/* Stage is actively running */}
                  {(activeStageData?.status === "running" || runningStage === activeStage) && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Running…
                    </span>
                  )}
                  {/* Stage not yet started and previous approved */}
                  {!activeStageData && canRunStage(activeStage) && runningStage !== activeStage && (
                    <button
                      onClick={() => handleRunStage(activeStage)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Run Stage
                    </button>
                  )}
                  {/* Verify Download — shown when stage failed OR complete but no docs */}
                  {activeStageData?.status === "failed" || (activeStageData?.status === "complete" && documents.length === 0) ? (
                    <button
                      onClick={() => handleVerifyDownload(activeStage)}
                      disabled={verifyingStage === activeStage}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-50"
                    >
                      {verifyingStage === activeStage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Verify Download
                    </button>
                  ) : null}
                  {/* Re-run with feedback after revision requested */}
                  {activeStageData?.status === "complete" && latestApproval?.decision === "revision_requested" && runningStage !== activeStage && (
                    <button
                      onClick={() => handleRunStage(activeStage, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Re-run with Feedback {openFeedbackCount > 0 ? `(${openFeedbackCount})` : ""}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <DocumentViewer documents={documents as never[]} role={role} />
        </div>

        {/* Sidebar: Feedback + Approval */}
        <div className="space-y-4">
          {role !== "client" && activeStageData?.status === "complete" && (
            <ApprovalBar
              projectId={id}
              stageNumber={activeStage}
              currentDecision={latestApproval?.decision as string | undefined}
              onDecision={async (decision: string) => {
                await refresh();
                await refreshStageData(activeStage);
                if (decision === "approved") {
                  if (activeStage < 3) {
                    // Auto-trigger next stage
                    const nextStage = activeStage + 1;
                    setActiveStage(nextStage);
                    await handleRunStage(nextStage);
                  } else {
                    // All done — go to summary
                    router.push(`/dashboard/${id}/summary`);
                  }
                }
              }}
            />
          )}

          <FeedbackThread
            projectId={id}
            stageNumber={activeStage}
            feedback={feedback as never[]}
            role={role}
            onFeedbackAdded={() => refreshStageData(activeStage)}
          />
        </div>
      </div>

      {/* View Summary button if project already complete */}
      {project && String(project.status) === "complete" && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => router.push(`/dashboard/${id}/summary`)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/20 transition"
          >
            View Project Summary
          </button>
        </div>
      )}
    </div>
  );
}
