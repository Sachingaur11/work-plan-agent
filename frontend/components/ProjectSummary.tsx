"use client";
import { useEffect, useState } from "react";
import { getStageDocuments, getDownloadUrl, listApprovals } from "@/lib/api";
import {
  CheckCircle2, Download, FileText, Sheet, FileJson,
  User, Mail, Calendar, Loader2, Sparkles,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface Project {
  id: string;
  name: string;
  client_name?: string;
  client_email?: string;
  created_at: string;
  updated_at: string;
  status: string;
}

interface Stage {
  stage_number: number;
  stage_name: string;
  status: string;
  version: number;
  completed_at?: string;
}

interface Doc {
  id: string;
  filename: string;
  stage_number: number;
  is_context_file: boolean;
  version: number;
}

interface Props {
  project: Project;
  stages: Stage[];
  role: string;
}

const STAGE_COLORS = [
  "from-blue-500 to-blue-600",
  "from-indigo-500 to-indigo-600",
  "from-violet-500 to-violet-600",
];

const STAGE_BG = ["bg-blue-50 border-blue-200", "bg-indigo-50 border-indigo-200", "bg-violet-50 border-violet-200"];
const STAGE_TEXT = ["text-blue-700", "text-indigo-700", "text-violet-700"];

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return <Sheet className="w-4 h-4 text-emerald-600" />;
  if (ext === "docx") return <FileText className="w-4 h-4 text-blue-600" />;
  if (ext === "json") return <FileJson className="w-4 h-4 text-orange-500" />;
  return <FileText className="w-4 h-4 text-slate-500" />;
}

function DownloadRow({ doc }: { doc: Doc }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const { url, filename } = await getDownloadUrl(doc.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white transition group text-left"
    >
      <FileIcon filename={doc.filename} />
      <span className="flex-1 text-sm text-slate-700 font-medium group-hover:text-blue-600 transition truncate">
        {doc.filename}
      </span>
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
        : <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition shrink-0" />
      }
    </button>
  );
}

export default function ProjectSummary({ project, stages, role }: Props) {
  const [allDocs, setAllDocs] = useState<Record<number, Doc[]>>({});
  const [approvalDates, setApprovalDates] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([1, 2, 3].map((n) => getStageDocuments(project.id, n))).then((results) => {
      const map: Record<number, Doc[]> = {};
      results.forEach((docs, i) => {
        map[i + 1] = (docs as Doc[]).filter((d) =>
          role === "client" ? !d.is_context_file : true
        );
      });
      setAllDocs(map);
    });

    Promise.all([1, 2, 3].map((n) => listApprovals(project.id, n))).then((results) => {
      const map: Record<number, string> = {};
      results.forEach((appvs, i) => {
        const approved = (appvs as Record<string, string>[]).find((a) => a.decision === "approved");
        if (approved) map[i + 1] = approved.created_at;
      });
      setApprovalDates(map);
    });
  }, [project.id, role]);

  const completedStages = stages.filter((s) => s.status === "complete");
  const totalFiles = Object.values(allDocs).flat().length;

  return (
    <div className="mt-8 space-y-6">
      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-20 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-emerald-400 text-sm font-semibold">Pipeline Complete</span>
            </div>
            <h2 className="text-2xl font-bold mb-1">{project.name}</h2>
            <p className="text-slate-400 text-sm">All 3 stages completed successfully</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-3xl font-bold text-white">{totalFiles}</p>
            <p className="text-slate-400 text-xs mt-0.5">files generated</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-6 grid grid-cols-3 gap-4">
          {[
            { label: "Stages Completed", value: `${completedStages.length} / 3` },
            { label: "Completed", value: project.updated_at ? formatDistanceToNow(new Date(project.updated_at), { addSuffix: true }) : "—" },
            { label: "Files Ready", value: String(totalFiles) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-xl px-4 py-3 border border-white/10">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Client + project info */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Project Details</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: User, label: "Client Name", value: project.client_name || "—" },
            { icon: Mail, label: "Client Email", value: project.client_email || "—" },
            { icon: Calendar, label: "Created", value: project.created_at ? format(new Date(project.created_at), "dd MMM yyyy, HH:mm") : "—" },
            { icon: CheckCircle2, label: "Status", value: "Complete" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Files by stage */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Generated Files</h3>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => {
            const stage = stages.find((s) => s.stage_number === n);
            const docs = allDocs[n] ?? [];
            const approvedAt = approvalDates[n];

            return (
              <div key={n} className={`rounded-2xl border ${STAGE_BG[n - 1]} overflow-hidden`}>
                {/* Stage header */}
                <div className={`bg-gradient-to-r ${STAGE_COLORS[n - 1]} px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-white/80 shrink-0" />
                    <div>
                      <p className="text-white text-xs font-medium opacity-80">Stage {n}</p>
                      <p className="text-white text-sm font-bold leading-tight">{stage?.stage_name ?? "—"}</p>
                    </div>
                  </div>
                  {approvedAt && (
                    <p className="text-white/60 text-xs mt-2">
                      Approved {formatDistanceToNow(new Date(approvedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>

                {/* Files */}
                <div className="p-2">
                  {docs.length === 0 ? (
                    <p className="text-xs text-slate-400 px-2 py-3">No files</p>
                  ) : (
                    docs.map((doc) => <DownloadRow key={doc.id} doc={doc} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
