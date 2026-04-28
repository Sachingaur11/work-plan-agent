"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  admin:    "bg-purple-100 text-purple-700",
  presales: "bg-blue-100 text-blue-700",
  client:   "bg-emerald-100 text-emerald-700",
};
const STAGE_LABELS: Record<number, string> = {
  1: "Questionnaire",
  2: "Scope of Work",
  3: "Dev Plan & Costing",
  4: "Role-based Dev Plans",
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [assignMode, setAssignMode] = useState<{ projectId: string; clientId: string } | null>(null);

  const { data: users = [], isLoading: usersLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: listUsers,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const { data: stageVersions = {} } = useQuery<Record<number, VersionInfo>>({
    queryKey: ["agent-versions"],
    queryFn: getAgentVersions,
    staleTime: 60_000,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole(userId, role),
    onSuccess: (_data, { userId, role }) => {
      queryClient.setQueryData<UserProfile[]>(["admin-users"], (old = []) =>
        old.map((u) => u.id === userId ? { ...u, role } : u)
      );
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ projectId, clientId }: { projectId: string; clientId: string }) =>
      assignClientToProject(projectId, clientId),
    onSuccess: () => {
      setAssignMode(null);
      toast.success("Client assigned to project");
    },
    onError: () => toast.error("Failed to assign client"),
  });

  const versionMutation = useMutation({
    mutationFn: ({ stage, version, enable }: { stage: number; version: number; enable: boolean }) =>
      enable ? enableAgentVersion(stage, version) : disableAgentVersion(stage, version),
    onSuccess: async (_data, { stage, version, enable }) => {
      const updated = await getAgentVersions();
      queryClient.setQueryData(["agent-versions"], updated);
      toast.success(`V${version} ${enable ? "enabled" : "disabled"} for Stage ${stage}`);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Failed to update version"),
  });

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
              <span className="ml-auto text-xs text-slate-400">
                {usersLoading ? "…" : `${users.length} total`}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {usersLoading
                ? [...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-6 py-3">
                      <div className="skeleton w-8 h-8 rounded-full" />
                      <div className="flex-1">
                        <div className="skeleton h-4 w-32 mb-1" />
                        <div className="skeleton h-3 w-44" />
                      </div>
                    </div>
                  ))
                : users.map((user) => (
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
                        onChange={(e) => roleMutation.mutate({ userId: user.id, role: e.target.value })}
                        disabled={roleMutation.isPending}
                        className={`text-xs px-2 py-1 rounded-lg border-0 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${ROLE_COLORS[user.role]}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {roleMutation.isPending && roleMutation.variables?.userId === user.id && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      )}
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
                onClick={() => assignMode && assignMutation.mutate({ projectId: assignMode.projectId, clientId: assignMode.clientId })}
                disabled={!assignMode?.projectId || !assignMode?.clientId || assignMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-40"
              >
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
            {([1, 2, 3, 4] as const).map((stage) => {
              const info = (stageVersions as Record<number, VersionInfo>)[stage] ?? { available: [], max_versions: 5 };
              const slots = Array.from({ length: info.max_versions }, (_, i) => i + 1);
              return (
                <div key={stage} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-44 shrink-0">
                    <p className="text-sm font-medium text-slate-800">Stage {stage}</p>
                    <p className="text-xs text-slate-400">{STAGE_LABELS[stage]}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {slots.map((v) => {
                      const isEnabled = info.available.includes(v);
                      const toggling  = versionMutation.isPending &&
                        versionMutation.variables?.stage === stage &&
                        versionMutation.variables?.version === v;
                      return (
                        <button
                          key={v}
                          onClick={() => versionMutation.mutate({ stage, version: v, enable: !isEnabled })}
                          disabled={toggling || versionMutation.isPending}
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
              Version config is persisted in the database and applies globally across all sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
