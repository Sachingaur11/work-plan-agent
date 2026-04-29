"use client";
import { useState } from "react";
import { X, Pencil, Loader2, FileText } from "lucide-react";
import { updateProject } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  client_name?: string | null;
  client_email?: string | null;
  transcript?: string | null;
}

interface Props {
  project: Project;
  onClose: () => void;
  onSaved: (updated: Project) => void;
}

export default function EditProjectModal({ project, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name:         project.name         ?? "",
    client_name:  project.client_name  ?? "",
    client_email: project.client_email ?? "",
    transcript:   project.transcript   ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Project name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, string | null> = {
        name:         form.name.trim(),
        client_name:  form.client_name.trim()  || null,
        client_email: form.client_email.trim() || null,
      };
      if (form.transcript !== (project.transcript ?? "")) {
        payload.transcript = form.transcript.trim() || null;
      }
      const updated = await updateProject(project.id, payload);
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal — wider (max-w-3xl) and taller */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col"
           style={{ maxHeight: "min(92vh, 860px)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <Pencil className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-slate-900">Edit Project</h2>
            <p className="text-xs text-slate-400 truncate max-w-md">{project.name}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">

            {/* Project name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputCls}
                placeholder="e.g. Acme Corp – AI Recruitment System"
              />
            </div>

            {/* Client details — side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Name</label>
                <input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  className={inputCls}
                  placeholder="Rahul Sharma"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Email</label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  className={inputCls}
                  placeholder="rahul@acme.com"
                />
              </div>
            </div>

            {/* Discovery Transcript — always visible */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <label className="text-sm font-medium text-slate-700">
                  Discovery Transcript
                </label>
                <span className="text-xs text-slate-400 font-normal">
                  — edit to re-run Stage 1 with updated input
                </span>
                {form.transcript && (
                  <span className="ml-auto text-xs text-slate-400">
                    {form.transcript.length.toLocaleString()} chars
                  </span>
                )}
              </div>
              <textarea
                value={form.transcript}
                onChange={(e) => setForm({ ...form, transcript: e.target.value })}
                rows={16}
                className={`font-mono text-xs leading-relaxed resize-none ${inputCls}`}
                placeholder="Paste the discovery call transcript here…"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-40"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Pencil className="w-4 h-4" /> Save Changes</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
