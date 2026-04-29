"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import {
  X, Save, Loader2, AlertCircle, Eye, Code2, Columns2,
  FileText, Sheet, FileJson, Plus, Trash2, Wand2,
} from "lucide-react";
import { fetchDocumentContent, updateDocumentContent } from "@/lib/api";
import { toast } from "sonner";

// CodeMirror — loaded client-side only (avoids SSR issues)
const CodeMirrorEditor = dynamic<{ value: string; lang: "markdown" | "json" | "text"; onChange: (v: string) => void }>(
  () => import("@/components/CodeMirrorEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-[#1e1e2e]">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Doc {
  id: string;
  filename: string;
  is_context_file: boolean;
}

interface Props {
  doc: Doc;
  onClose: () => void;
  onSaved: () => void;
}

type FileType = "md" | "json" | "xlsx" | "docx" | "unknown";
type ViewMode = "edit" | "split" | "preview";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileType(filename: string): FileType {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "md") return "md";
  if (ext === "json") return "json";
  if (ext === "xlsx") return "xlsx";
  if (ext === "docx") return "docx";
  return "unknown";
}

function colLetter(index: number): string {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function normalizeSheetsData(raw: unknown[][]): string[][] {
  const maxCols = raw.reduce((m, r) => Math.max(m, (r as unknown[]).length), 0);
  return raw.map((row) => {
    const r = row as unknown[];
    return Array.from({ length: Math.max(maxCols, 1) }, (_, i) =>
      r[i] !== undefined && r[i] !== null ? String(r[i]) : ""
    );
  });
}

function FileTypeBadge({ type }: { type: FileType }) {
  const map: Record<FileType, { label: string; className: string; icon: React.ReactNode }> = {
    md:      { label: "Markdown",    className: "bg-blue-100 text-blue-700",    icon: <FileText className="w-3 h-3" /> },
    json:    { label: "JSON",        className: "bg-orange-100 text-orange-700", icon: <FileJson className="w-3 h-3" /> },
    xlsx:    { label: "Spreadsheet", className: "bg-emerald-100 text-emerald-700", icon: <Sheet className="w-3 h-3" /> },
    docx:    { label: "Document",    className: "bg-violet-100 text-violet-700", icon: <FileText className="w-3 h-3" /> },
    unknown: { label: "File",        className: "bg-slate-100 text-slate-600",   icon: <FileText className="w-3 h-3" /> },
  };
  const { label, className, icon } = map[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
}

// ── Spreadsheet editor ────────────────────────────────────────────────────────

function SpreadsheetEditor({
  data,
  onChange,
}: {
  data: string[][];
  onChange: (data: string[][]) => void;
}) {
  const colCount = data[0]?.length ?? 1;

  function updateCell(ri: number, ci: number, value: string) {
    const next = data.map((r) => [...r]);
    next[ri][ci] = value;
    onChange(next);
  }

  function addRow() {
    onChange([...data, Array(colCount).fill("")]);
  }

  function deleteRow(ri: number) {
    if (data.length <= 1) return;
    onChange(data.filter((_, i) => i !== ri));
  }

  function addColumn() {
    onChange(data.map((r) => [...r, ""]));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Row
        </button>
        <button
          onClick={addColumn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Column
        </button>
        <span className="ml-auto text-xs text-slate-400">{data.length} rows × {colCount} cols</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto editor-scroll">
        <table className="border-collapse text-sm w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 min-w-[2.5rem] bg-slate-100 border border-slate-200 text-slate-400 text-xs font-medium text-center py-1.5 px-2 select-none" />
              {Array.from({ length: colCount }, (_, ci) => (
                <th
                  key={ci}
                  className="bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold text-center py-1.5 px-3 select-none min-w-[140px]"
                >
                  {colLetter(ci)}
                </th>
              ))}
              <th className="w-8 bg-slate-100 border border-slate-200" />
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="group">
                <td className="bg-slate-50 border border-slate-200 text-slate-400 text-xs text-center py-0.5 px-2 select-none font-medium w-10">
                  {ri + 1}
                </td>
                {Array.from({ length: colCount }, (_, ci) => (
                  <td key={ci} className="border border-slate-200 p-0">
                    <input
                      type="text"
                      value={row[ci] ?? ""}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className={`w-full h-full px-3 py-2 text-sm text-slate-800 bg-white focus:bg-blue-50/50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 transition min-w-[140px] ${
                        ri === 0 ? "font-semibold text-slate-900" : ""
                      }`}
                    />
                  </td>
                ))}
                <td className="border border-slate-200 bg-white w-8">
                  <button
                    onClick={() => deleteRow(ri)}
                    disabled={data.length <= 1}
                    className="w-full flex items-center justify-center py-2 text-slate-300 hover:text-red-500 disabled:opacity-0 transition"
                    title="Delete row"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function FileEditorModal({ doc, onClose, onSaved }: Props) {
  const fileType = getFileType(doc.filename);

  const [textContent, setTextContent]   = useState("");
  const [xlsxData,    setXlsxData]      = useState<Record<string, string[][]>>({});
  const [sheetNames,  setSheetNames]    = useState<string[]>([]);
  const [activeSheet, setActiveSheet]   = useState<string>("");

  const [viewMode,  setViewMode]  = useState<ViewMode>("split");
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [jsonError, setJsonError] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const buffer = await fetchDocumentContent(doc.id);
        if (cancelled) return;

        if (fileType === "md" || fileType === "json" || fileType === "unknown") {
          setTextContent(new TextDecoder("utf-8").decode(buffer));
        } else if (fileType === "docx") {
          const mammoth = (await import("mammoth")).default;
          const result  = await mammoth.extractRawText({ arrayBuffer: buffer });
          if (!cancelled) setTextContent(result.value);
        } else if (fileType === "xlsx") {
          const XLSX = await import("xlsx");
          const wb   = XLSX.read(new Uint8Array(buffer), { type: "array" });
          const sheets: Record<string, string[][]> = {};
          for (const name of wb.SheetNames) {
            const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
              header: 1,
              defval: "",
            });
            sheets[name] = normalizeSheetsData(raw);
          }
          if (!cancelled) {
            setXlsxData(sheets);
            setSheetNames(wb.SheetNames);
            setActiveSheet(wb.SheetNames[0] ?? "");
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [doc.id, fileType]);

  // Validate JSON live
  useEffect(() => {
    if (fileType !== "json" || !textContent) { setJsonError(""); return; }
    try { JSON.parse(textContent); setJsonError(""); }
    catch (e) { setJsonError(e instanceof Error ? e.message : "Invalid JSON"); }
  }, [textContent, fileType]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (fileType === "json" && jsonError) { toast.error("Fix JSON errors before saving"); return; }
    setSaving(true);
    setError("");
    try {
      let blob: Blob;

      if (fileType === "md") {
        blob = new Blob([textContent], { type: "text/markdown" });
      } else if (fileType === "json") {
        const pretty = JSON.stringify(JSON.parse(textContent), null, 2);
        blob = new Blob([pretty], { type: "application/json" });
      } else if (fileType === "xlsx") {
        const XLSX = await import("xlsx");
        const wb   = XLSX.utils.book_new();
        for (const name of sheetNames) {
          const ws = XLSX.utils.aoa_to_sheet(xlsxData[name] ?? [[]]);
          XLSX.utils.book_append_sheet(wb, ws, name);
        }
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        blob = new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else if (fileType === "docx") {
        const { Document, Paragraph, TextRun, Packer, HeadingLevel } = await import("docx");
        const children = textContent.split("\n").map((line) => {
          if (line.startsWith("### ")) return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 });
          if (line.startsWith("## "))  return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 });
          if (line.startsWith("# "))   return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 });
          return new Paragraph({ children: [new TextRun(line)] });
        });
        blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
      } else {
        blob = new Blob([textContent]);
      }

      await updateDocumentContent(doc.id, blob, doc.filename);
      toast.success(`${doc.filename} saved successfully`);
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [fileType, textContent, xlsxData, sheetNames, jsonError, doc.id, doc.filename, onSaved, onClose]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  function formatJson() {
    try { setTextContent(JSON.stringify(JSON.parse(textContent), null, 2)); } catch { /* shown inline */ }
  }

  function statsLabel() {
    if (fileType === "xlsx") {
      const d = xlsxData[activeSheet];
      return d ? `${d.length} rows × ${d[0]?.length ?? 0} cols` : "";
    }
    const lines = textContent.split("\n").length;
    return `${lines} lines · ${textContent.length.toLocaleString()} chars`;
  }

  // ── Editor body ───────────────────────────────────────────────────────────

  function renderEditor() {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center bg-[#1e1e2e]">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading {doc.filename}…</p>
          </div>
        </div>
      );
    }

    if (fileType === "xlsx") {
      return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-1 px-4 pt-2 border-b border-slate-200 bg-white shrink-0">
              {sheetNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setActiveSheet(name)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-x border-t transition ${
                    activeSheet === name
                      ? "bg-white border-slate-200 text-slate-800 -mb-px z-10"
                      : "bg-slate-50 border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeSheet && xlsxData[activeSheet] && (
              <SpreadsheetEditor
                data={xlsxData[activeSheet]}
                onChange={(next) => setXlsxData((prev) => ({ ...prev, [activeSheet]: next }))}
              />
            )}
          </div>
        </div>
      );
    }

    // Code editor (md / json / docx / unknown)
    const lang = fileType === "json" ? "json" : fileType === "md" ? "markdown" : "text";

    const codePane = (
      <div className="h-full min-h-0 overflow-hidden">
        <CodeMirrorEditor
          value={textContent}
          lang={lang}
          onChange={setTextContent}
        />
      </div>
    );

    const previewPane = (
      <div className="h-full overflow-auto editor-scroll bg-white px-8 py-6">
        <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-pre:bg-slate-900 prose-pre:text-slate-100">
          {fileType === "md" ? (
            <ReactMarkdown>{textContent}</ReactMarkdown>
          ) : (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{textContent}</pre>
          )}
        </div>
      </div>
    );

    if (fileType === "md") {
      if (viewMode === "edit")    return <div className="flex-1 min-h-0 overflow-hidden">{codePane}</div>;
      if (viewMode === "preview") return <div className="flex-1 min-h-0 overflow-hidden">{previewPane}</div>;
      return (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden border-r border-[#2d2d2d]">{codePane}</div>
          <div className="flex-1 min-h-0 overflow-hidden">{previewPane}</div>
        </div>
      );
    }

    return <div className="flex-1 min-h-0 overflow-hidden">{codePane}</div>;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: "min(92vw, 1400px)", height: "min(90vh, 900px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate">{doc.filename}</span>
            <FileTypeBadge type={fileType} />
            {fileType === "docx" && (
              <span className="text-xs text-slate-400 hidden sm:inline">
                · text extracted for editing; headings preserved on save
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {fileType === "json" && (
              <button
                onClick={formatJson}
                disabled={!!jsonError}
                title="Format JSON"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <Wand2 className="w-3.5 h-3.5" /> Format
              </button>
            )}

            {fileType === "md" && (
              <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                {(
                  [
                    { mode: "edit"    as ViewMode, icon: <Code2    className="w-3.5 h-3.5" />, label: "Edit"    },
                    { mode: "split"   as ViewMode, icon: <Columns2 className="w-3.5 h-3.5" />, label: "Split"   },
                    { mode: "preview" as ViewMode, icon: <Eye      className="w-3.5 h-3.5" />, label: "Preview" },
                  ]
                ).map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={label}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition ${
                      viewMode === mode
                        ? "bg-slate-800 text-white"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {icon}
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            )}

            <span className="text-xs text-slate-400 hidden md:inline">⌘S to save</span>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* JSON error banner */}
        {jsonError && (
          <div className="flex items-center gap-2 px-5 py-2 bg-red-50 border-b border-red-200 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-mono truncate">{jsonError}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {error && !loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm font-medium text-red-600">Failed to load file</p>
                <p className="text-xs text-slate-500">{error}</p>
              </div>
            </div>
          ) : (
            renderEditor()
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <span className="text-xs text-slate-400 font-mono">{loading ? "Loading…" : statsLabel()}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || (fileType === "json" && !!jsonError)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50 shadow-sm shadow-blue-500/20"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Save className="w-4 h-4" /> Save changes</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
