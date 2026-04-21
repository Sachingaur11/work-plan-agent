import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  awaiting_review: "Awaiting Review",
  revision_requested: "Revision Requested",
  approved: "Approved",
  rejected: "Rejected",
  complete: "Complete",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  awaiting_review: "bg-yellow-100 text-yellow-700",
  revision_requested: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  complete: "bg-emerald-100 text-emerald-700",
};

export const STAGE_NAMES: Record<number, string> = {
  1: "Questionnaire",
  2: "Scope of Work",
  3: "Dev Plan & Costing",
};
