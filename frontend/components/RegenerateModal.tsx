"use client";
import { useState } from "react";
import { X, RefreshCw, Loader2, FileText, Sheet, FileJson } from "lucide-react";
import { regenerateFiles } from "@/lib/api";
import AgentVersionSelector from "./AgentVersionSelector";

interface Document {
  id: string;
  filename: string;
  is_context_file: boolean;
}

interface Props {
  projectId: string;
  stageNumber: number;
  /** All documents for the stage */
  documents: Document[];
  /** Versions the admin has enabled for this stage */
  availableVersions: number[];
  /** Pre-selected filenames (e.g. when opened from a per-doc button) */
  preselectedFiles?: string[];
  onClose: () => void;
  onRegenerated: () => void;
}

function fileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") return <Sheet className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (ext === "json") return <FileJson className="w-4 h-4 text-orange-500 shrink-0" />;
  return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
}

export default function RegenerateModal({
  projectId,
  stageNumber,
  documents,
  availableVersions,
  preselectedFiles = [],
  onClose,
  onRegenerated,
}: Props) {
  const regeneratable = documents;
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselectedFiles.length ? preselectedFiles : regeneratable.map((d) => d.filename))
  );
  const [instructions, setInstructions] = useState("");
  const [agentVersion, setAgentVersion] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggle(filename: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(filename) ? next.delete(filename) : next.add(filename);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === regeneratable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(regeneratable.map((d) => d.filename)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instructions.trim()) {
      setError("Please enter instructions for the regeneration.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one file to regenerate.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await regenerateFiles(
        projectId,
        stageNumber,
        Array.from(selected),
        instructions.trim(),
        agentVersion ?? undefined,
      );
      onRegenerated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const allSelected = selected.size === regeneratable.length;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <RefreshCw className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-slate-900">Regenerate Files</h2>
            <p className="text-xs text-slate-400">Stage {stageNumber} · select files and provide instructions</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* File selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Files to regenerate</label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-indigo-600 hover:text-indigo-800 transition font-medium"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="space-y-2">
                {regeneratable.map((doc) => (
                  <label
                    key={doc.filename}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition ${
                      selected.has(doc.filename)
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(doc.filename)}
                      onChange={() => toggle(doc.filename)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {fileIcon(doc.filename)}
                    <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                      {doc.filename}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="Describe what should change in the regenerated file(s)…&#10;e.g. 'Update the pricing section to reflect a 20% discount' or 'Add a risk mitigation section to the SOW'"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition resize-none placeholder:text-slate-300"
              />
            </div>

            {/* Agent version */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Agent version <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <AgentVersionSelector
                availableVersions={availableVersions}
                selectedVersion={agentVersion}
                onSelect={setAgentVersion}
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {selected.size} of {regeneratable.length} file{regeneratable.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || selected.size === 0 || !instructions.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
