"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import {
  getProject, getProjectStages, getStageDocuments, listFeedback,
  listApprovals, runPipeline, verifyDownload, getAgentVersions, deleteProject,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import PipelineTracker from "@/components/PipelineTracker";
import DocumentViewer from "@/components/DocumentViewer";
import FeedbackThread from "@/components/FeedbackThread";
import ApprovalBar from "@/components/ApprovalBar";
import AgentVersionSelector from "@/components/AgentVersionSelector";
import RegenerateModal from "@/components/RegenerateModal";
import EditProjectModal from "@/components/EditProjectModal";
import StageChat from "@/components/StageChat";
import { STATUS_LABELS, STATUS_COLORS, STAGE_NAMES } from "@/lib/utils";
import { ArrowLeft, Play, RotateCcw, Loader2, AlertCircle, ShieldCheck, RefreshCw, Pencil, Trash2, LayoutList, Sparkles, MessageSquare } from "lucide-react";
import Link from "next/link";

interface VersionInfo {
  available: number[];
  max_versions: number;
}

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
  const [runningLabel, setRunningLabel] = useState("Running…");
  const [verifyingStage, setVerifyingStage] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Version selector state — per stage
  const [stageVersionInfo, setStageVersionInfo] = useState<Record<number, VersionInfo>>({});
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Regeneration modal state
  const [regenModal, setRegenModal] = useState<{
    open: boolean;
    preselected: string[];
  }>({ open: false, preselected: [] });

  // Edit / delete state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");

  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState<"chat" | "review">("review");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [proj, stgs] = await Promise.all([getProject(id), getProjectStages(id)]);
      setProject(proj);
      setStages(stgs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to the API. Is the backend running?");
    }
  }, [id]);

  const refreshStageData = useCallback(async (stage: number) => {
    try {
      const [docs, fb, appv] = await Promise.all([
        getStageDocuments(id, stage),
        listFeedback(id, stage),
        listApprovals(id, stage),
      ]);
      setDocuments(docs);
      setFeedback(fb);
      setApprovals(appv);
    } catch {
      // Silently ignore — error already shown by refresh() or action handlers
    }
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

  // Load agent version info once
  useEffect(() => {
    getAgentVersions().then((info) => {
      setStageVersionInfo(info as Record<number, VersionInfo>);
    }).catch(() => {});
  }, []);

  // Reset version selection when switching stages
  useEffect(() => {
    setSelectedVersion(null);
  }, [activeStage]);

  // Poll every 5s while a stage is running.
  // fromVersion: the latest version that existed BEFORE this action was triggered.
  // We only stop when we see a version NEWER than that which is complete/failed,
  // so a pre-existing "complete" row never prematurely kills the polling.
  const startPolling = useCallback((stage: number, fromVersion: number = 0) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      const [proj, stgs] = await Promise.all([getProject(id), getProjectStages(id)]);
      setProject(proj);
      setStages(stgs);
      const latestStage = (stgs as Record<string, unknown>[])
        .filter((s) => s.stage_number === stage)
        .sort((a, b) => (b.version as number) - (a.version as number))[0];
      const latestVersion = (latestStage?.version as number) ?? 0;
      const isDone = latestStage?.status === "complete" || latestStage?.status === "failed";
      if (latestVersion > fromVersion && isDone) {
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
      getProjectStages(id).then((stgs) => {
        const running = (stgs as Record<string, unknown>[]).find((s) => s.status === "running");
        if (running) {
          setRunningStage(running.stage_number as number);
          startPolling(running.stage_number as number);
        }
      }).catch(() => {});
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
      }, () => { refresh().catch(() => {}); refreshStageData(activeStage).catch(() => {}); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, activeStage, refresh, refreshStageData]);

  function currentVersionFor(stage: number): number {
    return (stages as Record<string, unknown>[])
      .filter((s) => (s.stage_number as number) === stage)
      .reduce((max, s) => Math.max(max, (s.version as number) ?? 0), 0);
  }

  async function handleVerifyDownload(stage: number) {
    setVerifyingStage(stage);
    setError("");
    const fromVersion = currentVersionFor(stage);
    try {
      await verifyDownload(id, stage);
      startPolling(stage, fromVersion);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setVerifyingStage(null);
    }
  }

  async function handleRunStage(stage: number, rerun = false, version?: number | null) {
    setRunningStage(stage);
    setRunningLabel(rerun ? "Re-running…" : "Running…");
    setError("");
    const fromVersion = currentVersionFor(stage);
    try {
      await runPipeline(id, stage, rerun, version ?? undefined);
      startPolling(stage, fromVersion);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setRunningStage(null);
    }
  }

  function openRegenModal(preselected: string[] = []) {
    setRegenModal({ open: true, preselected });
  }

  async function handleDelete() {
    setDeleteState("deleting");
    try {
      await deleteProject(id);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleteState("idle");
    }
  }

  // Build stageMap using the FIRST occurrence per stage_number.
  // Stages are sorted version DESC, so first = latest version.
  // Object.fromEntries would overwrite with the last (oldest) — we avoid that.
  const stageMap: Record<number, Record<string, unknown>> = {};
  for (const s of stages as Record<string, unknown>[]) {
    const n = s.stage_number as number;
    if (!(n in stageMap)) stageMap[n] = s;
  }
  const activeStageData = stageMap[activeStage] as Record<string, unknown> | undefined;
  const latestApproval = (approvals as Record<string, unknown>[])[0];

  // An approval is stale when it was created before the current stage version started
  // (i.e. files were regenerated after the approval). Treat stale = no decision.
  const approvalIsStale =
    latestApproval && activeStageData?.started_at
      ? new Date(latestApproval.created_at as string) < new Date(activeStageData.started_at as string)
      : false;
  const effectiveDecision = approvalIsStale
    ? undefined
    : (latestApproval?.decision as string | undefined);

  const openFeedbackCount = (feedback as Record<string, unknown>[]).filter((f) => !f.resolved).length;
  const currentVersionInfo = stageVersionInfo[activeStage] ?? { available: [1], max_versions: 5 };

  const canRunStage = (n: number) => {
    if (n === 1) return true;
    return (stages as Record<string, unknown>[]).some(
      (s) => s.stage_number === n - 1 && (
        (approvals as Record<string, unknown>[]).some((a) => a.stage_number === n - 1 && a.decision === "approved")
      )
    );
  };

  const stageIsComplete = activeStageData?.status === "complete";
  const stageIsRunning = activeStageData?.status === "running" || runningStage === activeStage;

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

        {/* Header actions */}
        {project && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Summary — always visible once stage 3 has run */}
            {(stages as Record<string, unknown>[]).some((s) => s.stage_number === 3) && (
              <button
                onClick={() => router.push(`/dashboard/${id}/summary`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold transition shadow-sm shadow-blue-500/20"
              >
                <LayoutList className="w-4 h-4" />
                Summary
              </button>
            )}

            {/* Edit / Delete — presales and admin only */}
            {role !== "client" && (
              <>
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 text-sm font-medium transition"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            {deleteState === "confirm" ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-sm">
                <span className="text-red-700 font-medium">Delete project?</span>
                <button
                  onClick={handleDelete}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setDeleteState("idle")}
                  className="px-2.5 py-1 rounded-lg hover:bg-red-100 text-red-600 text-xs font-medium transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteState("confirm")}
                disabled={deleteState === "deleting"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-sm font-medium transition disabled:opacity-40"
              >
                {deleteState === "deleting"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
                Delete
              </button>
              )}
            </>
            )}
          </div>
        )}
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
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3 space-y-3">
            {/* Top row: stage title + status + action buttons */}
            <div className="flex items-center gap-3">
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
              {/* Version badge on the stage row when pinned was used */}
              {activeStageData?.agent_version && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  ran with V{String(activeStageData.agent_version)}
                </span>
              )}

              <div className="ml-auto flex gap-2 items-center">
                {role !== "client" && (
                  <>
                    {stageIsRunning && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {runningLabel}
                      </span>
                    )}
                    {!activeStageData && canRunStage(activeStage) && !stageIsRunning && (
                      <button
                        onClick={() => handleRunStage(activeStage, false, selectedVersion)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Run Stage
                      </button>
                    )}
                    {(activeStageData?.status === "failed" || (activeStageData?.status === "complete" && documents.length === 0)) ? (
                      <button
                        onClick={() => handleVerifyDownload(activeStage)}
                        disabled={verifyingStage === activeStage}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-50"
                      >
                        {verifyingStage === activeStage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        Verify Download
                      </button>
                    ) : null}
                    {stageIsComplete && effectiveDecision === "revision_requested" && !stageIsRunning && (
                      <button
                        onClick={() => handleRunStage(activeStage, true, selectedVersion)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Re-run with Feedback {openFeedbackCount > 0 ? `(${openFeedbackCount})` : ""}
                      </button>
                    )}
                    {/* Regenerate files button — available whenever stage is complete */}
                    {stageIsComplete && !stageIsRunning && (
                      <button
                        onClick={() => openRegenModal([])}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate Files
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bottom row: agent version selector (non-client, non-running) */}
            {role !== "client" && !stageIsRunning && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <AgentVersionSelector
                  availableVersions={currentVersionInfo.available}
                  maxVersions={currentVersionInfo.max_versions}
                  selectedVersion={selectedVersion}
                  onSelect={setSelectedVersion}
                  disabled={stageIsRunning}
                />
                {selectedVersion !== null && (
                  <span className="text-xs text-indigo-600 font-medium">
                    · next run will use V{selectedVersion}
                  </span>
                )}
              </div>
            )}
          </div>

          <DocumentViewer
            documents={documents as never[]}
            role={role}
            onRegenerateFile={
              role !== "client" && stageIsComplete && !stageIsRunning
                ? (filename) => openRegenModal([filename])
                : undefined
            }
          />
        </div>

        {/* Sidebar: AI Chat + Review tabs */}
        <div className="flex flex-col">
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 mb-4 shrink-0">
            <button
              onClick={() => setSidebarTab("review")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                sidebarTab === "review"
                  ? "bg-white text-slate-700 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Review
              {openFeedbackCount > 0 && (
                <span className="ml-1 flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                  {openFeedbackCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setSidebarTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                sidebarTab === "chat"
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Chat
            </button>
          </div>

          {/* Chat panel — preserved in DOM when hidden so conversation isn't lost */}
          <div className={sidebarTab === "chat" ? "block" : "hidden"}>
            <StageChat
              key={activeStage}
              projectId={id}
              stageNumber={activeStage}
            />
          </div>

          {/* Review panel */}
          {sidebarTab === "review" && (
            <div className="space-y-4">
              {role !== "client" && stageIsComplete && (
                <ApprovalBar
                  projectId={id}
                  stageNumber={activeStage}
                  currentDecision={effectiveDecision}
                  onDecision={async (decision: string) => {
                    await refresh();
                    await refreshStageData(activeStage);
                    if (decision === "approved") {
                      if (activeStage < 3) {
                        setActiveStage(activeStage + 1);
                      } else {
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
          )}
        </div>
      </div>

      {/* Edit project modal */}
      {editOpen && project && (
        <EditProjectModal
          project={{
            id: String(project.id),
            name: String(project.name),
            client_name: project.client_name as string | null,
            client_email: project.client_email as string | null,
            transcript: project.transcript as string | null,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setProject(updated as Record<string, unknown>);
          }}
        />
      )}

      {/* Regenerate modal */}
      {regenModal.open && (
        <RegenerateModal
          projectId={id}
          stageNumber={activeStage}
          documents={documents as never[]}
          availableVersions={currentVersionInfo.available}
          preselectedFiles={regenModal.preselected}
          onClose={() => setRegenModal({ open: false, preselected: [] })}
          onRegenerated={() => {
            setRunningStage(activeStage);
            setRunningLabel("Regenerating…");
            startPolling(activeStage, currentVersionFor(activeStage));
          }}
        />
      )}
    </div>
  );
}
