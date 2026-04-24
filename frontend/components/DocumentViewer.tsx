"use client";
import { useState } from "react";
import { Download, FileText, Sheet, FileJson, Loader2, RefreshCw } from "lucide-react";
import { getDownloadUrl } from "@/lib/api";

interface Document {
  id: string;
  filename: string;
  is_context_file: boolean;
  version: number;
}

interface Props {
  documents: Document[];
  role: string;
  /** Called when the user clicks the per-doc regenerate button */
  onRegenerateFile?: (filename: string) => void;
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return <Sheet className="w-5 h-5 text-emerald-600" />;
  if (ext === "docx") return <FileText className="w-5 h-5 text-blue-600" />;
  if (ext === "json") return <FileJson className="w-5 h-5 text-orange-500" />;
  return <FileText className="w-5 h-5 text-slate-500" />;
}

function DownloadCard({
  doc,
  showRegenerate,
  onRegenerate,
}: {
  doc: Document;
  showRegenerate: boolean;
  onRegenerate?: () => void;
}) {
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
    <div className="flex items-center gap-2 group">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-4 flex-1 px-5 py-4 rounded-2xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition text-left"
      >
        <div className="p-2.5 rounded-xl bg-slate-100 group-hover:bg-blue-100 transition shrink-0">
          <FileIcon filename={doc.filename} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition truncate">
            {doc.filename}
          </p>
          {doc.version > 1 && (
            <p className="text-xs text-slate-400 mt-0.5">Version {doc.version}</p>
          )}
        </div>
        <div className="shrink-0">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          ) : (
            <Download className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition" />
          )}
        </div>
      </button>

      {showRegenerate && onRegenerate && (
        <button
          onClick={onRegenerate}
          title={`Regenerate ${doc.filename}`}
          className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function DocumentViewer({ documents, role, onRegenerateFile }: Props) {
  const visible = role === "client"
    ? documents.filter((d) => !d.is_context_file)
    : documents;

  const showRegenerate = role !== "client" && !!onRegenerateFile;

  if (!visible.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-14 text-slate-400">
        <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm font-medium">No documents generated yet</p>
        <p className="text-xs mt-1 text-slate-300">Run this stage to generate files</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Generated Files</p>
        <p className="text-xs text-slate-400 mt-0.5">{visible.length} file{visible.length !== 1 ? "s" : ""} available</p>
      </div>
      <div className="p-4 space-y-2">
        {visible.map((doc) => (
          <DownloadCard
            key={doc.id}
            doc={doc}
            showRegenerate={showRegenerate}
            onRegenerate={() => onRegenerateFile?.(doc.filename)}
          />
        ))}
      </div>
    </div>
  );
}
