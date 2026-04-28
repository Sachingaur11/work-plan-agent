"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const LIMIT_SECONDS = 7 * 60; // 7-minute limit

interface Props {
  /** ISO timestamp of when the stage started. Used to compute elapsed time accurately
   *  even if the component is mounted after the run began (e.g. on page refresh). */
  startedAt?: string | null;
  /** Compact single-line variant — just the bar, no header row */
  compact?: boolean;
  className?: string;
}

function useElapsed(startedAt?: string | null) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      : 0
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(
        startedAt
          ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
          : (s) => s + 1
      );
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

export default function RunTimer({ startedAt, compact = false, className = "" }: Props) {
  const elapsed   = useElapsed(startedAt);
  const remaining = Math.max(0, LIMIT_SECONDS - elapsed);
  const progress  = Math.min(1, elapsed / LIMIT_SECONDS);
  const overtime  = elapsed >= LIMIT_SECONDS;
  const warning   = remaining <= 120 && !overtime; // last 2 min

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  const barColor  = overtime ? "bg-red-400"   : warning ? "bg-amber-400"   : "bg-blue-500";
  const textColor = overtime ? "text-red-500" : warning ? "text-amber-500" : "text-blue-500";
  const bgColor   = overtime ? "bg-red-50"    : warning ? "bg-amber-50"    : "bg-blue-50/60";

  if (compact) {
    return (
      <div className={`w-full space-y-1 ${className}`}>
        <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${barColor}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className={`text-[10px] font-semibold tabular-nums ${textColor}`}>
          {overtime ? "overtime" : timeStr}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl ${bgColor} px-4 py-2.5 space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className={`w-3.5 h-3.5 ${textColor}`} />
          <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
            {overtime ? "Taking longer than expected…" : `${timeStr} remaining`}
          </span>
        </div>
        <span className="text-xs text-slate-400">7 min limit</span>
      </div>
      <div className="h-1.5 w-full bg-white/70 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${barColor}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
