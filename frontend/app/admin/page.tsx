"use client";
import { useEffect, useState } from "react";
import {
  listUsers, updateUserRole, listProjects,
  assignClientToProject,
  getAgentVersions, enableAgentVersion, disableAgentVersion,
} from "@/lib/api";
import { Users, FolderKanban, Loader2, Check, Cpu } from "lucide-react";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  company: string | null;
}

interface Project {
  id: string;
  name: string;
  client_name: string | null;
}

interface VersionInfo {
  available: number[];
  max_versions: number;
}

const ROLES = ["admin", "presales", "client"];
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  presales: "bg-blue-100 text-blue-700",
  client: "bg-emerald-100 text-emerald-700",
};
const STAGE_LABELS: Record<number, string> = {
  1: "Questionnaire",
  2: "Scope of Work",
  3: "Dev Plan & Costing",
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<{ projectId: string; clientId: string } | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // Agent version management
  const [stageVersions, setStageVersions] = useState<Record<number, VersionInfo>>({});
  const [versionTogglingKey, setVersionTogglingKey] = useState<string | null>(null); // "stage-version"

  useEffect(() => {
    Promise.all([listUsers(), listProjects(), getAgentVersions()]).then(([u, p, v]) => {
      setUsers(u);
      setProjects(p);
      setStageVersions(v as Record<number, VersionInfo>);
    }).catch(() => {});
  }, []);

  async function handleRoleChange(userId: string, role: string) {
    setLoadingRole(userId);
    try {
      await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
    } finally {
      setLoadingRole(null);
    }
  }

  async function handleAssign() {
    if (!assignMode) return;
    setAssignLoading(true);
    try {
      await assignClientToProject(assignMode.projectId, assignMode.clientId);
      setAssignMode(null);
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleToggleVersion(stageNumber: number, version: number) {
    const key = `${stageNumber}-${version}`;
    setVersionTogglingKey(key);
    const isEnabled = stageVersions[stageNumber]?.available.includes(version);
    try {
      if (isEnabled) {
        await disableAgentVersion(stageNumber, version);
      } else {
        await enableAgentVersion(stageNumber, version);
      }
      // Refresh version info
      const updated = await getAgentVersions();
      setStageVersions(updated as Record<number, VersionInfo>);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setVersionTogglingKey(null);
    }
  }

  const clients = users.filter((u) => u.role === "client");

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Manage users, project access, and agent versions</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Users table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-800">Users</h2>
              <span className="ml-auto text-xs text-slate-400">{users.length} total</span>
            </div>
            <div className="divide-y divide-slate-100">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
                    {(user.full_name || user.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{user.full_name || "—"}</p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={loadingRole === user.id}
                      className={`text-xs px-2 py-1 rounded-lg border-0 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${ROLE_COLORS[user.role]}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {loadingRole === user.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project assignment */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <FolderKanban className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-800">Assign Clients to Projects</h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Project</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    onChange={(e) => setAssignMode((prev) => ({ ...prev, projectId: e.target.value, clientId: prev?.clientId || "" }))}
                  >
                    <option value="">Select project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Client</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    onChange={(e) => setAssignMode((prev) => ({ projectId: prev?.projectId || "", ...prev, clientId: e.target.value }))}
                  >
                    <option value="">Select client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleAssign}
                disabled={!assignMode?.projectId || !assignMode?.clientId || assignLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-40"
              >
                {assignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Assign Access
              </button>
            </div>
          </div>
        </div>

        {/* Agent version management */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800">Agent Versions</h2>
            <span className="ml-auto text-xs text-slate-400">
              Enable versions to make them selectable when running stages
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {([1, 2, 3] as const).map((stage) => {
              const info = stageVersions[stage] ?? { available: [], max_versions: 5 };
              const slots = Array.from({ length: info.max_versions }, (_, i) => i + 1);
              return (
                <div key={stage} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-40 shrink-0">
                    <p className="text-sm font-medium text-slate-800">Stage {stage}</p>
                    <p className="text-xs text-slate-400">{STAGE_LABELS[stage]}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {slots.map((v) => {
                      const isEnabled = info.available.includes(v);
                      const toggling = versionTogglingKey === `${stage}-${v}`;
                      return (
                        <button
                          key={v}
                          onClick={() => handleToggleVersion(stage, v)}
                          disabled={toggling}
                          title={isEnabled ? `Disable V${v}` : `Enable V${v}`}
                          className={`
                            relative px-3 py-1.5 rounded-lg text-xs font-semibold transition
                            ${isEnabled
                              ? "bg-indigo-600 text-white hover:bg-indigo-700"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            }
                            disabled:opacity-60 disabled:cursor-not-allowed
                          `}
                        >
                          {toggling ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              V{v}
                              {isEnabled && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white" />
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 ml-auto">
                    {info.available.length} enabled
                  </p>
                </div>
              );
            })}
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Version config resets on server restart. Persist to the database via{" "}
              <code className="font-mono bg-slate-200 px-1 rounded">GET /admin/agents/stages/versions</code>{" "}
              if durability is needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
