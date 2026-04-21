"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Lightweight progress bar — no external dependency needed
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    // Animate in
    bar.style.transition = "none";
    bar.style.width = "0%";
    bar.style.opacity = "1";

    // Short delay then grow to ~80%
    requestAnimationFrame(() => {
      bar.style.transition = "width 0.3s ease";
      bar.style.width = "70%";

      timerRef.current = setTimeout(() => {
        bar.style.transition = "width 0.5s ease";
        bar.style.width = "90%";
      }, 300);
    });

    // Complete on next tick
    const completeTimer = setTimeout(() => {
      bar.style.transition = "width 0.2s ease, opacity 0.3s ease 0.2s";
      bar.style.width = "100%";
      bar.style.opacity = "0";
    }, 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(completeTimer);
    };
  }, [pathname, searchParams]);

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 h-[3px] z-[9999] pointer-events-none"
      style={{
        background: "linear-gradient(90deg, hsl(221.2, 83.2%, 53.3%), hsl(239, 84%, 67%))",
        boxShadow: "0 0 8px hsl(221.2, 83.2%, 53.3%)",
        width: "0%",
        opacity: "0",
      }}
    />
  );
}
