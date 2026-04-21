"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/api";
import { ArrowLeft, Upload, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<"paste" | "upload">("paste");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", client_name: "", client_email: "", transcript: "",
  });
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      if (form.client_name) fd.append("client_name", form.client_name);
      if (form.client_email) fd.append("client_email", form.client_email);
      if (inputMode === "paste") {
        fd.append("transcript", form.transcript);
      } else if (file) {
        fd.append("transcript_file", file);
      }
      const project = await createProject(fd);
      router.push(`/dashboard/${project.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/dashboard" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to projects
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="text-slate-500 text-sm mt-1">Create a new presales pipeline from a discovery call transcript</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project details */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-800">Project Details</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Project Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition text-sm"
              placeholder="e.g. Acme Corp – AI Recruitment System"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Name</label>
              <input
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition text-sm"
                placeholder="Rahul Sharma"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Email</label>
              <input
                type="email"
                value={form.client_email}
                onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition text-sm"
                placeholder="rahul@acme.com"
              />
            </div>
          </div>
        </div>

        {/* Transcript input */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">Discovery Call Transcript</h2>

          {/* Mode switcher */}
          <div className="flex gap-2 mb-4">
            {(["paste", "upload"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setInputMode(mode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                  inputMode === mode
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {mode === "paste" ? <FileText className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {mode === "paste" ? "Paste Text" : "Upload File"}
              </button>
            ))}
          </div>

          {inputMode === "paste" ? (
            <textarea
              value={form.transcript}
              onChange={(e) => setForm({ ...form, transcript: e.target.value })}
              required={inputMode === "paste"}
              rows={12}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition text-sm font-mono resize-none"
              placeholder="Paste the discovery call transcript here…"
            />
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-10 text-center cursor-pointer transition group"
            >
              <Upload className="w-8 h-8 mx-auto text-slate-300 group-hover:text-blue-400 transition mb-2" />
              {file ? (
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-500">Click to upload transcript</p>
                  <p className="text-xs text-slate-400 mt-1">.txt or .docx</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.docx,.doc"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? "Creating project…" : "Create Project"}
        </button>
      </form>
    </div>
  );
}
