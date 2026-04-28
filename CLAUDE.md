# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```
Copy `backend/.env.example` → `backend/.env` and fill in all values.

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
npm run lint   # ESLint via next lint
```
Copy `frontend/.env.local.example` → `frontend/.env.local` and fill in Supabase + API URL.

### Legacy CLI (original single-file pipeline)
```bash
python main.py
```

There are no automated tests (no pytest, Jest, or Cypress configured).

## Deployment

- **Backend**: Railway via `backend/nixpacks.toml` + `backend/railway.toml` — pip install + uvicorn start command.
- **Frontend**: Vercel (Next.js native).
- **Health check**: `GET /health` → `{"status": "ok"}`.

## Environment Variables

**Backend** (`backend/.env`):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API authentication |
| `ENVIRONMENT_ID` | Managed environment ID |
| `AGENT_ID_1` | Stage 1 presales agent |
| `SOW_AGENT_ID` | Stage 2 scope-of-work agent |
| `DEV_PLAN_AGENT_ID` | Stage 3 development plan agent |
| `DEVPLAN_ROLES_AGENT_ID` | Stage 4 role-based dev plans agent |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (bypasses RLS) |
| `FRONTEND_URL` | Frontend origin for CORS (default: `http://localhost:3000`) |

**Frontend** (`frontend/.env.local`):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | FastAPI base URL (default: `http://localhost:8000`) |

## Database

Run migrations in order in the Supabase SQL editor:
1. `supabase/migrations/001_init.sql` — all base tables, RLS policies
2. `supabase/migrations/002_agent_versioning.sql` — adds `agent_version INTEGER` column to `pipeline_stages`
3. `supabase/migrations/003_stage4_support.sql` — widens `stage_number` CHECK from `(1,2,3)` to `(1,2,3,4)`
4. `supabase/migrations/004_agent_version_config.sql` — `agent_version_config` table persisting admin-enabled versions; seeds V1 for all stages

Create a Supabase Storage bucket named **`presale-outputs`** (private).

**Tables**: `user_profiles` (role), `projects` (transcript), `pipeline_stages` (version, session_id, status, **agent_version**), `documents` (storage_path, version, is_latest, is_context_file), `feedback` (resolved), `approvals` (decision), `client_project_access` (junction).

`pipeline_stages.agent_version`: `NULL` = latest was used; `1–5` = pinned to that version.

## Architecture

This is a **full-stack presales pipeline dashboard** — a 3-stage AI agent pipeline wrapped in a web app with role-based access, versioned documents, inline feedback, approval workflows, and admin-controlled agent version pinning.

### Tech Stack
- **Backend**: FastAPI (Python), Supabase service-role client
- **Frontend**: Next.js 14 App Router, Tailwind CSS, shadcn/ui components
- **Database + Auth**: Supabase (PostgreSQL + Auth + Storage + Realtime)

### Pipeline Flow

```
Presales team pastes/uploads discovery transcript
        ↓
Stage 1: Presale Agent → 01_questionnaire.md, context_v1_intake.json
        ↓ (presales approves → switches to Stage 2 tab, user manually runs)
Stage 2: SOW Agent (mounts Stage 1 files) → 02_scope_of_work.md, .docx, context_v2_sow.json
        ↓ (presales approves → switches to Stage 3 tab, user manually runs)
Stage 3: Dev Plan Agent (mounts Stage 2 files) → 03_development_plan_and_costing.xlsx, context_v3_development_plan.json
        ↓ (presales approves → switches to Stage 4 tab, user manually runs)
Stage 4: Roles Agent (mounts 02_scope_of_work.md from Stage 2 + xlsx + context json from Stage 3) → 04_devplan_pm.md, 04_devplan_dev.md, 04_devplan_qa.md
        ↓ (presales approves → navigates to /summary)
```

Approval navigates to the next stage tab but does **not** auto-start it — the user clicks "Run Stage" manually.

Each stage can be re-run with feedback injected; each re-run creates a new version. Files are stored in Supabase Storage at `{project_id}/v{version}/{filename}`. Previous documents are marked `is_latest = false` on re-run.

Individual files (any type) can be regenerated without re-running the whole stage via `regenerate_files()` — a modal always opens for instructions before any regeneration starts.

`STAGE_META` dict in `pipeline_service.py` is the single source of truth for each stage: agent env-var name, expected output filenames, which filenames are context files, and which files to mount as inputs (Stage 4 uses `input_stages` to pull from two prior stages). Add a new stage here first before touching any router or frontend code.

### Key Backend Files

- `backend/services/pipeline_service.py` — core pipeline logic. Entry points: `run_stage(project_id, stage_number, feedback_comments, agent_version)` and `regenerate_files(project_id, stage_number, file_names, instructions, agent_version)`. `_run_session()` breaks on any terminal status event (`session.status_idle`, `session.status_error`, `session.status_terminated`, `session.status_complete`) and swallows stream exceptions — the download step validates actual output. Post-download validates expected filenames were produced before marking complete.
- `backend/services/agent_handler.py` — agent version availability config per stage, **persisted in the `agent_version_config` DB table** (migration `004`). Changes survive server restarts and apply globally. Default: only V1 enabled for all stages; max 5 versions per stage.
- `backend/routers/pipeline.py` — background task triggers for `run_stage` / `regenerate_files`; SSE endpoint for live status; `POST /{id}/stages/{n}/verify-download` re-downloads files from an existing Anthropic session (accepts optional `session_id` body to recover sessions where the ID wasn't saved due to early failure); `GET /agents/versions`.
- `backend/routers/projects.py` — CRUD for projects including `PATCH /{id}` (partial update, `exclude_unset=True`) and `DELETE /{id}` (deletes Storage files from documents table paths, then cascades through all child tables in dependency order).
- `backend/routers/admin.py` — user management + `GET/POST/DELETE /admin/agents/stages/{stage}/versions/{version}` for version gating.
- `backend/routers/chat.py` — `POST /projects/{id}/chat` streaming SSE endpoint. Builds a rich system prompt by parallel-fetching project, stages, documents, approvals, and feedback from Supabase; downloads `.md`/`.json` doc contents (truncated at 4000 chars); streams Claude (`claude-sonnet-4-6`) responses as `{"text": "..."}` SSE events, terminated by `[DONE]`.
- `backend/routers/feedback.py` — `POST/GET /projects/{id}/stages/{n}/feedback` (adds/lists feedback enriched with author name); `PATCH /feedback/{id}/resolve`.
- `backend/routers/approvals.py` — `POST/GET /projects/{id}/stages/{n}/approve`; updates project status on approval (stage 3 approved → `complete`).
- `backend/routers/files.py` — `GET /documents/{id}/download` returns signed URL; blocks clients from downloading context files.
- `backend/services/supabase_client.py` — singleton `get_supabase()` factory; used by all routers and services.
- `backend/app.py` — JWT auth middleware attaches `user_id` + `user_role` to `request.state`; CORS. `FRONTEND_URL` may be comma-separated for multiple origins.
- `backend/models.py` — all Pydantic schemas. `VerifyDownloadRequest` has optional `session_id` for manual recovery.

### Key Frontend Files

- `frontend/lib/api.ts` — typed API client; auto-attaches Supabase auth token. All project CRUD, pipeline actions, agent version management, and admin endpoints.
- `frontend/app/dashboard/page.tsx` — **client component**; fetches projects via API, shows inline per-card delete confirmation (trash icon appears on hover).
- `frontend/app/dashboard/[id]/page.tsx` — main project detail page. Critical logic:
  - `stageMap` is built with a **loop taking first occurrence** (stages are `version DESC` — first = latest). Do NOT use `Object.fromEntries` directly as it would overwrite with the oldest version.
  - `effectiveDecision` detects stale approvals: if `approval.created_at < stage.started_at`, the approval predates the current run and is treated as `undefined` so the ApprovalBar shows action buttons again.
  - `startPolling(stage, fromVersion)` only stops when a version **newer than `fromVersion`** is complete/failed — prevents the old complete row from killing the poll before the background task creates the new running row.
  - Running label is context-aware: "Running…" / "Re-running…" / "Regenerating…".
- `frontend/app/dashboard/[id]/summary/page.tsx` — accessible whenever stage 4 has been run (not gated on `status === "complete"`). Redirects away only if stage 4 has never run.
- `frontend/app/auth/callback/route.ts` — server-side OAuth callback for Supabase Google SSO.
- `frontend/app/admin/` — user role management, client-project assignment, agent version enable/disable UI.
- `frontend/components/EditProjectModal.tsx` — edit project name, client info, transcript (transcript section is collapsible; editing it allows re-running Stage 1 with new input).
- `frontend/components/RegenerateModal.tsx` — always-modal regeneration: all files (including context/JSON) are selectable; instructions are required; opened by both "Regenerate Files" button and per-file regenerate icons.
- `frontend/components/ApprovalBar.tsx` — when `currentDecision === "approved"` shows static badge; otherwise shows Approve / Request Revision / Reject. Receives `effectiveDecision` (not raw latest approval) so stale approvals don't block re-approval after regeneration.
- `frontend/components/AgentVersionSelector.tsx` — pill picker (Default + V1–V5); only admin-enabled versions clickable.
- `frontend/components/DocumentViewer.tsx` — per-file regenerate button shown on **all** file types (not filtered by `is_context_file`).
- `frontend/components/StageChat.tsx` — floating chat panel per stage; streams from `POST /projects/{id}/chat`; reads SSE `{"text": "..."}` chunks and appends to the current assistant message.
- `frontend/app/client/[projectId]/page.tsx` — read-only client portal; shows only approved-stage documents; uses `ClientDownloads` for file access. Clients cannot see context files.
- `frontend/lib/supabase/client.ts` + `server.ts` — browser and server Supabase client factories (Next.js App Router split).
- `frontend/lib/utils.ts` — shared constants: `STATUS_LABELS` (display names), `STATUS_COLORS` (Tailwind badge classes), `STAGE_NAMES` (stage number → title map), and the `cn()` Tailwind merge helper.
- `frontend/components/FeedbackThread.tsx` — inline comment thread per stage; allows adding new feedback and resolving existing items.
- `frontend/components/PipelineTracker.tsx` — top progress bar showing stage statuses; clicking a stage tab updates `activeStage`.
- `frontend/components/ProjectSummary.tsx` — renders the `/summary` page body with all stage-4 role-plan documents side-by-side.

### User Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Everything + user management + client assignment + agent version management + edit/delete any project |
| `presales` | Create/edit/delete own projects, run/re-run stages, approve/reject, add feedback, pin agent versions |
| `client` | View approved documents, add feedback, download files |

RLS policies enforce boundaries at the DB level. Backend uses service-role key (bypasses RLS) but enforces role checks via `request.state.user_role`. Edit/delete also check `created_by == user_id` for presales.

### Anthropic API Patterns

- **Managed Agents**: `client.beta.sessions.create(agent=agent_id, environment_id=..., resources=[])` with beta header `managed-agents-2026-04-01`
- **Version Pinning**: when `agent_version` is provided, agent resource is `{"type": "agent", "id": agent_id, "version": agent_version}` instead of a bare string ID.
- **Files API**: `client.beta.files.upload()` to mount previous-stage outputs; `client.beta.files.download()` to retrieve outputs. Beta header: `files-api-2025-04-14`
- **Session files**: listed via `GET /v1/files?session_id=...` with raw httpx (SDK doesn't expose this param). Filtered by allowed extensions; input files that fail download are silently skipped.
- **Stream handling**: `_run_session` wraps the event stream in `try/except` and breaks on any terminal status — callers never see stream errors; the download step is the real gate.

### Verify-Download Recovery

When a stage shows "failed" but files exist in the Anthropic session, use `POST /projects/{id}/stages/{n}/verify-download`. If the session_id was never saved to the DB (old failure before the stream fix), supply it manually:

```bash
curl -X POST .../stages/3/verify-download \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess_..."}'
```

### Feedback → Re-run Flow

1. Presales clicks "Request Revision" → `POST /projects/{id}/stages/{n}/approve` with `decision: revision_requested`
2. Comments saved to `feedback` table
3. "Re-run with Feedback" button → `POST /projects/{id}/pipeline/run` with `rerun: true`
4. `pipeline_service.run_stage()` fetches unresolved feedback, appends to agent message
5. New `pipeline_stages` row with `version + 1`; previous documents marked `is_latest = false`

### Agent Version Pinning Flow

1. Admin enables V2 for Stage 2 via `POST /admin/agents/stages/2/versions/2/enable`
2. `agent_handler._config[2]` becomes `[1, 2]` (in-memory; resets on restart)
3. Frontend fetches `GET /agents/versions` → `AgentVersionSelector` renders V1 and V2
4. User selects V2 → passed to `runPipeline()` or `regenerateFiles()`
5. `_run_session()` creates session with version-pinned agent resource
6. `agent_version=2` stored in `pipeline_stages`; dashboard shows "ran with V2" badge
