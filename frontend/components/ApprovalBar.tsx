"use client";
import { useState } from "react";
import { createApproval } from "@/lib/api";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";

interface Props {
  projectId: string;
  stageNumber: number;
  currentDecision?: string;
  onDecision: (decision: string) => void;
}

export default function ApprovalBar({ projectId, stageNumber, currentDecision, onDecision }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);

  async function handleDecision(decision: string) {
    if (decision === "revision_requested" && !showComment) {
      setPendingDecision(decision);
      setShowComment(true);
      return;
    }
    setLoading(decision);
    try {
      await createApproval(projectId, stageNumber, decision, comment || undefined);
      setShowComment(false);
      setComment("");
      setPendingDecision(null);
      onDecision(decision);
    } finally {
      setLoading(null);
    }
  }

  if (currentDecision === "approved") {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Stage {stageNumber} approved
      </div>
    );
  }

  if (currentDecision === "rejected") {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
        <XCircle className="w-4 h-4" />
        Stage {stageNumber} rejected
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
      <p className="text-sm font-semibold text-slate-700 mb-3">Review Stage {stageNumber}</p>

      {showComment && (
        <div className="mb-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Describe what needs to be changed…"
            className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition resize-none"
          />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleDecision("approved")}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition disabled:opacity-50"
        >
          {loading === "approved" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Approve
        </button>

        <button
          onClick={() => showComment && pendingDecision ? handleDecision("revision_requested") : handleDecision("revision_requested")}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-medium transition disabled:opacity-50"
        >
          {loading === "revision_requested" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {showComment ? "Send for Revision" : "Request Revision"}
        </button>

        <button
          onClick={() => handleDecision("rejected")}
          disabled={!!loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition disabled:opacity-50"
        >
          {loading === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Reject
        </button>

        {showComment && (
          <button
            type="button"
            onClick={() => { setShowComment(false); setComment(""); setPendingDecision(null); }}
            className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-700 text-sm transition"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
