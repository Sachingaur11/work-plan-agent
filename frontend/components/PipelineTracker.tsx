"use client";
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  stage_number: number;
  stage_name: string;
  status: string;
  version: number;
}

interface Props {
  stages: Stage[];
  activeStage: number;
  onStageClick: (n: number) => void;
}

const STAGE_NAMES = ["Questionnaire", "Scope of Work", "Dev Plan & Costing"];

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case "running":
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    case "failed":
      return <XCircle className="w-5 h-5 text-red-500" />;
    default:
      return <Circle className="w-5 h-5 text-slate-300" />;
  }
}

export default function PipelineTracker({ stages, activeStage, onStageClick }: Props) {
  const stageMap = Object.fromEntries(stages.map((s) => [s.stage_number, s]));

  return (
    <div className="flex items-center gap-0">
      {[1, 2, 3].map((n, i) => {
        const stage = stageMap[n];
        const status = stage?.status ?? "pending";
        const active = activeStage === n;
        const version = stage?.version ?? 1;

        return (
          <div key={n} className="flex items-center">
            <button
              onClick={() => onStageClick(n)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition group",
                active
                  ? "bg-blue-50 border border-blue-200"
                  : "hover:bg-slate-50"
              )}
            >
              <StageIcon status={status} />
              <div className="text-left">
                <p className={cn("text-sm font-semibold", active ? "text-blue-700" : "text-slate-700")}>
                  Stage {n}
                  {version > 1 && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">v{version}</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{STAGE_NAMES[n - 1]}</p>
              </div>
            </button>
            {i < 2 && (
              <div className={cn("w-8 h-0.5 mx-1", status === "complete" ? "bg-emerald-300" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
