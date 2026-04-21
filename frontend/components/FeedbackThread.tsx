"use client";
import { useState } from "react";
import { addFeedback, resolveFeedback } from "@/lib/api";
import { MessageSquare, Check, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeedbackItem {
  id: string;
  content: string;
  author_name: string | null;
  resolved: boolean;
  created_at: string;
}

interface Props {
  projectId: string;
  stageNumber: number;
  feedback: FeedbackItem[];
  role: string;
  onFeedbackAdded: () => void;
}

export default function FeedbackThread({ projectId, stageNumber, feedback, role, onFeedbackAdded }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await addFeedback(projectId, stageNumber, text.trim());
      setText("");
      onFeedbackAdded();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(id: string) {
    await resolveFeedback(id);
    onFeedbackAdded();
  }

  const open = feedback.filter((f) => !f.resolved);
  const resolved = feedback.filter((f) => f.resolved);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <MessageSquare className="w-4 h-4 text-slate-500" />
        <h3 className="font-semibold text-slate-700 text-sm">Feedback</h3>
        {open.length > 0 && (
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
            {open.length} open
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {open.map((item) => (
          <div key={item.id} className="px-5 py-4 flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0 mt-0.5">
              {item.author_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{item.author_name ?? "Unknown"}</span>
                <span className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.content}</p>
            </div>
            {role !== "client" && (
              <button
                onClick={() => handleResolve(item.id)}
                className="shrink-0 flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600 transition mt-0.5"
                title="Mark resolved"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {resolved.length > 0 && (
          <details className="group">
            <summary className="px-5 py-3 text-xs text-slate-400 cursor-pointer hover:text-slate-600 list-none flex items-center gap-1">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              {resolved.length} resolved comment{resolved.length > 1 ? "s" : ""}
            </summary>
            {resolved.map((item) => (
              <div key={item.id} className="px-5 py-3 flex gap-3 opacity-50">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {item.author_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-500 line-through">{item.content}</span>
                </div>
              </div>
            ))}
          </details>
        )}
      </div>

      {/* Add comment */}
      <form onSubmit={handleSubmit} className="px-5 py-4 border-t border-slate-100">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment or feedback…"
            className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-40 flex items-center gap-1.5 text-sm font-medium"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
