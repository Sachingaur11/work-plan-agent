"""
Chat router — streaming Claude chat with full project/stage context.
"""
from __future__ import annotations

import asyncio
import json
import os

import anthropic
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from models import ChatRequest
from services.supabase_client import get_supabase
from services.pipeline_service import STAGE_META, BUCKET

router = APIRouter(prefix="/projects", tags=["chat"])


def _get_user_id(request: Request) -> str:
    uid = request.state.user_id
    if not uid:
        raise HTTPException(401, "Not authenticated")
    return uid


# ── Parallel data fetching ─────────────────────────────────────────────────────

def _fetch_project(project_id: str) -> dict:
    sb = get_supabase()
    return sb.table("projects").select("*").eq("id", project_id).single().execute().data

def _fetch_stages(project_id: str) -> list:
    sb = get_supabase()
    return (
        sb.table("pipeline_stages")
        .select("*")
        .eq("project_id", project_id)
        .order("stage_number")
        .order("version", desc=True)
        .execute()
        .data
    )

def _fetch_docs(project_id: str, stage_number: int) -> list:
    sb = get_supabase()
    return (
        sb.table("documents")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .eq("is_latest", True)
        .order("created_at")
        .execute()
        .data
    )

def _fetch_approvals(project_id: str, stage_number: int) -> list:
    sb = get_supabase()
    return (
        sb.table("approvals")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("created_at", desc=True)
        .execute()
        .data
    )

def _fetch_feedback(project_id: str, stage_number: int) -> list:
    sb = get_supabase()
    return (
        sb.table("feedback")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("created_at")
        .execute()
        .data
    )

def _download_doc(storage_path: str) -> str | None:
    try:
        sb = get_supabase()
        raw = sb.storage.from_(BUCKET).download(storage_path)
        text = raw.decode("utf-8", errors="replace")
        if len(text) > 4000:
            text = text[:4000] + f"\n... [truncated — {len(text)} total chars]"
        return text
    except Exception:
        return None


async def _build_system_prompt(project_id: str, stage_number: int) -> str:
    # Run all DB queries in parallel — cuts ~5 sequential round-trips to 1
    project, all_stages, docs, approvals, feedback_rows = await asyncio.gather(
        asyncio.to_thread(_fetch_project, project_id),
        asyncio.to_thread(_fetch_stages, project_id),
        asyncio.to_thread(_fetch_docs, project_id, stage_number),
        asyncio.to_thread(_fetch_approvals, project_id, stage_number),
        asyncio.to_thread(_fetch_feedback, project_id, stage_number),
    )

    if not project:
        raise HTTPException(404, "Project not found")

    stage_map: dict[int, dict] = {}
    for s in all_stages:
        n = s["stage_number"]
        if n not in stage_map:
            stage_map[n] = s

    # Download readable doc contents in parallel
    readable_docs = [d for d in docs if d["filename"].rsplit(".", 1)[-1].lower() in ("md", "json")]
    if readable_docs:
        contents = await asyncio.gather(
            *[asyncio.to_thread(_download_doc, d["storage_path"]) for d in readable_docs]
        )
        doc_content: dict[str, str | None] = {d["storage_path"]: c for d, c in zip(readable_docs, contents)}
    else:
        doc_content = {}

    parts: list[str] = []

    # ── Project Overview ──────────────────────────────────────────────────────
    parts.append("# Project Overview")
    parts.append(f"- **Project Name**: {project.get('name', 'N/A')}")
    parts.append(f"- **Client Name**: {project.get('client_name') or 'N/A'}")
    parts.append(f"- **Client Email**: {project.get('client_email') or 'N/A'}")
    parts.append(f"- **Project Status**: {project.get('status', 'N/A')}")
    parts.append(f"- **Created At**: {project.get('created_at', 'N/A')}")

    transcript = project.get("transcript") or ""
    if transcript:
        excerpt = transcript[:2500]
        parts.append("\n## Discovery Transcript (excerpt)")
        parts.append(excerpt)
        if len(transcript) > 2500:
            parts.append(f"... [transcript continues — {len(transcript)} total characters]")

    # ── Pipeline Stages Overview ──────────────────────────────────────────────
    parts.append("\n# Pipeline Stages Overview")
    for n in [1, 2, 3]:
        meta = STAGE_META.get(n, {})
        stage = stage_map.get(n)
        if stage:
            parts.append(f"- **Stage {n} — {meta.get('name', '')}**: {stage.get('status')} (version {stage.get('version', 1)})")
        else:
            parts.append(f"- **Stage {n} — {meta.get('name', '')}**: Not started yet")

    # ── Current Stage Detail ──────────────────────────────────────────────────
    meta = STAGE_META.get(stage_number, {})
    current_stage = stage_map.get(stage_number)
    parts.append(f"\n# Current Context: Stage {stage_number} — {meta.get('name', '')}")
    if current_stage:
        parts.append(f"- **Status**: {current_stage.get('status', 'N/A')}")
        parts.append(f"- **Version**: {current_stage.get('version', 1)}")
        parts.append(f"- **Started**: {current_stage.get('started_at', 'N/A')}")
        parts.append(f"- **Completed**: {current_stage.get('completed_at', 'N/A')}")
        if current_stage.get("error_message"):
            parts.append(f"- **Error**: {current_stage['error_message']}")
    else:
        parts.append("This stage has not been run yet.")

    # ── Documents ─────────────────────────────────────────────────────────────
    parts.append(f"\n# Documents — Stage {stage_number}")
    if docs:
        for doc in docs:
            filename = doc["filename"]
            is_ctx = doc.get("is_context_file", False)
            ver = doc.get("version", 1)
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            label = f"{'context file' if is_ctx else 'output'}, v{ver}"

            if ext in ("md", "json"):
                text = doc_content.get(doc["storage_path"])
                if text:
                    parts.append(f"\n## {filename} ({label})")
                    parts.append("```")
                    parts.append(text)
                    parts.append("```")
                else:
                    parts.append(f"\n## {filename} ({label}) — [content unavailable]")
            else:
                parts.append(f"\n## {filename} ({label}) — binary file (not shown inline)")
    else:
        parts.append("No documents have been generated for this stage yet.")

    # ── Approval ──────────────────────────────────────────────────────────────
    parts.append(f"\n# Approval Status — Stage {stage_number}")
    if approvals:
        latest = approvals[0]
        parts.append(f"- **Decision**: {latest.get('decision', 'N/A')}")
        if latest.get("comment"):
            parts.append(f"- **Comment**: {latest['comment']}")
        parts.append(f"- **Recorded At**: {latest.get('created_at', 'N/A')}")
    else:
        parts.append("No approval has been recorded for this stage yet.")

    # ── Feedback ──────────────────────────────────────────────────────────────
    parts.append(f"\n# Feedback Thread — Stage {stage_number}")
    if feedback_rows:
        for fb in feedback_rows:
            state = "resolved" if fb.get("resolved") else "open"
            author = fb.get("author_name") or "Team Member"
            parts.append(f"- [{state}] **{author}**: {fb.get('content', '')}")
    else:
        parts.append("No feedback has been submitted for this stage yet.")

    parts.append("""
# Your Role as Presales AI Assistant

You are an expert presales consultant AI embedded inside this project's pipeline dashboard.
You have complete context about this client engagement, the generated documents, and all pipeline activity.

Help the user:
- Understand and summarise the generated documents for this stage
- Identify gaps, risks, or inconsistencies in the outputs
- Suggest improvements to scope, timeline, or pricing
- Answer questions about client requirements derived from the transcript
- Compare stages or explain dependencies between them
- Surface actionable insights about the deal

Tone: concise, professional, and strategic. Lead with the most important point.
Format responses with markdown — use headers, bullets, and bold for clarity.
Never invent data that is not in the context above.
""")

    return "\n".join(parts)


@router.post("/{project_id}/chat")
async def chat_stream(project_id: str, body: ChatRequest, request: Request):
    """Streaming Claude chat with full project/stage context via SSE."""
    _get_user_id(request)

    # Build context (parallel DB queries)
    system_prompt = await _build_system_prompt(project_id, body.stage_number)

    messages = [{"role": item.role, "content": item.content} for item in body.history]
    messages.append({"role": "user", "content": body.message})

    async def generate():
        try:
            async_client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            async with async_client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
