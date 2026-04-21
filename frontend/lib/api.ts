import { createClient } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects() {
  return apiFetch("/projects");
}

export async function getProject(id: string) {
  return apiFetch(`/projects/${id}`);
}

export async function createProject(data: FormData) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers,
    body: data,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProjectStages(projectId: string) {
  return apiFetch(`/projects/${projectId}/stages`);
}

export async function getStageDocuments(projectId: string, stage: number) {
  return apiFetch(`/projects/${projectId}/stages/${stage}/documents`);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runPipeline(projectId: string, stage_number: number, rerun = false) {
  return apiFetch(`/projects/${projectId}/pipeline/run`, {
    method: "POST",
    body: JSON.stringify({ stage_number, rerun }),
  });
}

export async function verifyDownload(projectId: string, stageNumber: number) {
  return apiFetch(`/projects/${projectId}/stages/${stageNumber}/verify-download`, {
    method: "POST",
  });
}

export function createPipelineEventSource(projectId: string, token: string) {
  return new EventSource(
    `${API_BASE}/projects/${projectId}/pipeline/status?token=${token}`
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function getDownloadUrl(documentId: string): Promise<{ url: string; filename: string }> {
  return apiFetch(`/documents/${documentId}/download`);
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function listFeedback(projectId: string, stage: number) {
  return apiFetch(`/projects/${projectId}/stages/${stage}/feedback`);
}

export async function addFeedback(projectId: string, stage: number, content: string, documentId?: string) {
  return apiFetch(`/projects/${projectId}/stages/${stage}/feedback`, {
    method: "POST",
    body: JSON.stringify({ content, document_id: documentId }),
  });
}

export async function resolveFeedback(feedbackId: string) {
  return apiFetch(`/feedback/${feedbackId}/resolve`, { method: "PATCH" });
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function createApproval(
  projectId: string,
  stage: number,
  decision: string,
  comment?: string
) {
  return apiFetch(`/projects/${projectId}/stages/${stage}/approve`, {
    method: "POST",
    body: JSON.stringify({ decision, comment }),
  });
}

export async function listApprovals(projectId: string, stage: number) {
  return apiFetch(`/projects/${projectId}/stages/${stage}/approve`);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function listUsers() {
  return apiFetch("/admin/users");
}

export async function updateUserRole(userId: string, role: string) {
  return apiFetch(`/admin/users/${userId}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export async function assignClientToProject(projectId: string, clientId: string) {
  return apiFetch(`/admin/projects/${projectId}/assign-client`, {
    method: "POST",
    body: JSON.stringify({ client_id: clientId }),
  });
}

export async function removeClientFromProject(projectId: string, clientId: string) {
  return apiFetch(`/admin/projects/${projectId}/assign-client/${clientId}`, {
    method: "DELETE",
  });
}
