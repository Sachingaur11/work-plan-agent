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
```
Copy `frontend/.env.local.example` → `frontend/.env.local` and fill in Supabase + API URL.

### Legacy CLI (original single-file pipeline)
```bash
python main.py
```

## Environment Variables

**Backend** (`backend/.env`):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API authentication |
| `ENVIRONMENT_ID` | Managed environment ID |
| `AGENT_ID_1` | Stage 1 presales agent |
| `SOW_AGENT_ID` | Stage 2 scope-of-work agent |
| `DEV_PLAN_AGENT_ID` | Stage 3 development plan agent |
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

Run `supabase/migrations/001_init.sql` in the Supabase SQL editor to set up all tables and RLS policies.

Create a Supabase Storage bucket named **`presale-outputs`** (private).

## Architecture

This is a **full-stack presales pipeline dashboard** — a 3-stage AI agent pipeline wrapped in a web app with role-based access, versioned documents, inline feedback, and approval workflows.

### Tech Stack
- **Backend**: FastAPI (Python), Supabase service-role client
- **Frontend**: Next.js 14 App Router, Tailwind CSS, shadcn/ui components
- **Database + Auth**: Supabase (PostgreSQL + Auth + Storage + Realtime)

### Pipeline Flow

```
Presales team pastes/uploads discovery transcript
        ↓
Stage 1: Presale Agent → 01_questionnaire.md, context_v1_intake.json
        ↓ (presales approves)
Stage 2: SOW Agent (mounts Stage 1 files) → 02_scope_of_work.md, .docx, context_v2_sow.json
        ↓ (presales approves)
Stage 3: Dev Plan Agent (mounts Stage 2 files) → 03_development_plan_and_costing.xlsx, context_v3_development_plan.json
```

Each stage can be re-run with feedback injected; each re-run creates a new version. Files are stored in Supabase Storage at `{project_id}/v{version}/{filename}`.

### Key Backend Files

- `backend/services/pipeline_service.py` — core pipeline logic: runs Anthropic managed agents, downloads outputs, uploads to Supabase Storage, writes DB rows. Entry point: `run_stage(project_id, stage_number, feedback_comments)`.
- `backend/routers/pipeline.py` — triggers `run_stage` in a background task; SSE endpoint (`/projects/{id}/pipeline/status`) streams stage updates to the frontend.
- `backend/app.py` — FastAPI app with JWT auth middleware (validates Supabase tokens) and CORS.

### Key Frontend Files

- `frontend/lib/api.ts` — typed API client for all backend endpoints; auto-attaches Supabase auth token.
- `frontend/app/dashboard/[id]/page.tsx` — main project detail page with Supabase Realtime subscription for live pipeline progress.
- `frontend/components/PipelineTracker.tsx` — visual Stage 1→2→3 stepper.
- `frontend/components/DocumentViewer.tsx` — renders .md files inline via `react-markdown`; download cards for .docx/.xlsx.
- `frontend/components/FeedbackThread.tsx` — comment thread per stage (all roles can comment; presales can resolve).
- `frontend/components/ApprovalBar.tsx` — Approve / Request Revision / Reject actions (presales/admin only).
- `frontend/components/ClientDownloads.tsx` — download hub for client portal (locked until stage is approved).

### User Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Everything + user management + client assignment |
| `presales` | Create projects, run/re-run stages, approve/reject, add feedback |
| `client` | View approved documents, add feedback, download files |

### Anthropic API Patterns

- **Managed Agents**: `client.beta.sessions.create(agent=agent_id, environment_id=..., resources=[])` with beta `managed-agents-2026-04-01`
- **Files API**: `client.beta.files.upload()` to mount previous-stage outputs as resources; `client.beta.files.download()` to retrieve outputs
- **Session files**: queried via `GET /v1/files?session_id=...` with raw httpx (SDK doesn't expose this query param)

### Feedback → Re-run Flow

1. Presales clicks "Request Revision" → `POST /projects/{id}/stages/{n}/approve` with `decision: revision_requested`
2. Comments saved to `feedback` table
3. "Re-run with Feedback" button calls `POST /projects/{id}/pipeline/run` with `rerun: true`
4. `pipeline_service.run_stage()` fetches unresolved feedback, appends to agent message
5. New `pipeline_stages` row with `version + 1`; previous documents marked `is_latest = false`
