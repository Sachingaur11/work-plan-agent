"use client";
import { useEffect, useState } from "react";
import { getStageDocuments, getDownloadUrl } from "@/lib/api";
import { Download, FileText, Sheet, Loader2, Lock } from "lucide-react";
import { STAGE_NAMES } from "@/lib/utils";

interface Props {
  projectId: string;
  stageApprovals: Record<number, boolean>;
}

interface DocFile {
  id: string;
  filename: string;
  stage_number: number;
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return <Sheet className="w-4 h-4 text-emerald-600" />;
  if (ext === "docx") return <FileText className="w-4 h-4 text-blue-600" />;
  return <FileText className="w-4 h-4 text-slate-400" />;
}

export default function ClientDownloads({ projectId, stageApprovals }: Props) {
  const [allDocs, setAllDocs] = useState<DocFile[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    // Fetch docs for approved stages
    const approvedStages = [1, 2, 3].filter((n) => stageApprovals[n]);
    if (!approvedStages.length) return;

    Promise.all(approvedStages.map((n) => getStageDocuments(projectId, n))).then((results) => {
      const docs: DocFile[] = results.flatMap((stageDocs, i) =>
        (stageDocs as DocFile[]).filter((d) => !("is_context_file" in d && d.is_context_file))
      );
      setAllDocs(docs);
    });
  }, [projectId, stageApprovals]);

  async function handleDownload(doc: DocFile) {
    setDownloading(doc.id);
    try {
      const { url, filename } = await getDownloadUrl(doc.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Available Downloads</h2>
        <p className="text-xs text-slate-400 mt-0.5">Files become available after each stage is approved</p>
      </div>
      <div className="p-4">
        {[1, 2, 3].map((stage) => {
          const approved = stageApprovals[stage];
          const stageDocs = allDocs.filter((d) => d.stage_number === stage);
          return (
            <div key={stage} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Stage {stage} — {STAGE_NAMES[stage]}
                </span>
                {!approved && <Lock className="w-3 h-3 text-slate-300" />}
              </div>
              {!approved ? (
                <p className="text-xs text-slate-400 pl-1">Awaiting approval…</p>
              ) : stageDocs.length === 0 ? (
                <p className="text-xs text-slate-400 pl-1">No files yet</p>
              ) : (
                <div className="space-y-1.5">
                  {stageDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleDownload(doc)}
                      disabled={downloading === doc.id}
                      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 transition group text-left"
                    >
                      <FileIcon filename={doc.filename} />
                      <span className="flex-1 text-sm text-slate-700 group-hover:text-blue-700 font-medium">{doc.filename}</span>
                      {downloading === doc.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        : <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" />
                      }
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
