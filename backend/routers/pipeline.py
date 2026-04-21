import asyncio
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
import json

from ..models import RunPipelineRequest
from ..services.supabase_client import get_supabase
from ..services import pipeline_service

router = APIRouter(prefix="/projects", tags=["pipeline"])

# In-memory SSE listeners: project_id → list of asyncio.Queue
_sse_listeners: dict[str, list[asyncio.Queue]] = {}


def _notify_sse(project_id: str, payload: dict):
    for q in _sse_listeners.get(project_id, []):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


def _run_stage_background(project_id: str, stage_number: int, feedback_comments: list[str]):
    """Blocking call — runs in threadpool via BackgroundTasks."""
    try:
        stage = pipeline_service.run_stage(project_id, stage_number, feedback_comments or None)
        _notify_sse(project_id, {"type": "stage_complete", "stage": stage})
    except Exception as exc:
        _notify_sse(project_id, {"type": "stage_error", "stage_number": stage_number, "error": str(exc)})


@router.post("/{project_id}/pipeline/run")
async def run_pipeline(
    project_id: str,
    body: RunPipelineRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    sb = get_supabase()

    # Validate project exists
    project = sb.table("projects").select("status").eq("id", project_id).single().execute()
    if not project.data:
        raise HTTPException(404, "Project not found")

    stage_number = body.stage_number

    # Stage gating: stage N requires stage N-1 approved
    if stage_number > 1:
        approval = (
            sb.table("approvals")
            .select("decision")
            .eq("project_id", project_id)
            .eq("stage_number", stage_number - 1)
            .eq("decision", "approved")
            .limit(1)
            .execute()
        )
        if not approval.data:
            raise HTTPException(400, f"Stage {stage_number - 1} must be approved before running stage {stage_number}")

    # Gather unresolved feedback if re-running
    feedback_comments: list[str] = []
    if body.rerun:
        fb = (
            sb.table("feedback")
            .select("content")
            .eq("project_id", project_id)
            .eq("stage_number", stage_number)
            .eq("resolved", False)
            .execute()
        )
        feedback_comments = [r["content"] for r in fb.data]

    background_tasks.add_task(_run_stage_background, project_id, stage_number, feedback_comments)
    return {"status": "started", "stage_number": stage_number}


@router.post("/{project_id}/stages/{stage_number}/verify-download")
async def verify_download(project_id: str, stage_number: int, request: Request, background_tasks: BackgroundTasks):
    """
    Re-download output files from the existing Anthropic session for a stage.
    Use when a stage shows 'failed' or documents are missing despite the agent having run.
    """
    sb = get_supabase()

    # Get the latest stage row that has a session ID
    stage_row = (
        sb.table("pipeline_stages")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .not_.is_("anthropic_session_id", "null")
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not stage_row.data:
        raise HTTPException(404, "No session found for this stage — run the stage first")

    stage = stage_row.data[0]
    if not stage.get("anthropic_session_id"):
        raise HTTPException(400, "Stage has no Anthropic session ID to download from")

    background_tasks.add_task(_verify_download_background, project_id, stage_number, stage)
    return {"status": "verifying", "session_id": stage["anthropic_session_id"]}


def _verify_download_background(project_id: str, stage_number: int, stage: dict):
    """Re-download files from an existing session and update DB/storage."""
    from ..services.pipeline_service import (
        _download_session_files, _upload_to_storage, STAGE_META,
    )
    from datetime import datetime, timezone

    sb = get_supabase()
    session_id = stage["anthropic_session_id"]
    stage_id = stage["id"]
    version = stage["version"]
    meta = STAGE_META[stage_number]

    try:
        output_files = _download_session_files(session_id)
        if not output_files:
            raise RuntimeError("No downloadable files found in session")

        # Mark previous docs for this stage as not latest
        sb.table("documents").update({"is_latest": False}).eq("project_id", project_id).eq("stage_number", stage_number).execute()

        for filename, content in output_files.items():
            storage_path = _upload_to_storage(project_id, version, filename, content)
            is_ctx = filename in meta.get("context_files", [])
            # Upsert: delete existing doc with same filename+version then insert fresh
            sb.table("documents").delete().eq("stage_id", stage_id).eq("filename", filename).execute()
            sb.table("documents").insert({
                "project_id": project_id,
                "stage_id": stage_id,
                "stage_number": stage_number,
                "filename": filename,
                "storage_path": storage_path,
                "version": version,
                "is_latest": True,
                "is_context_file": is_ctx,
            }).execute()

        # Mark stage complete
        sb.table("pipeline_stages").update({
            "status": "complete",
            "error_message": None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", stage_id).execute()

        sb.table("projects").update({"status": "awaiting_review"}).eq("id", project_id).execute()

    except Exception as exc:
        sb.table("pipeline_stages").update({
            "status": "failed",
            "error_message": f"Verify download failed: {exc}",
        }).eq("id", stage_id).execute()


@router.get("/{project_id}/pipeline/status")
async def pipeline_status_stream(project_id: str, request: Request):
    """Server-Sent Events endpoint for real-time pipeline progress."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _sse_listeners.setdefault(project_id, []).append(queue)

    async def event_generator():
        try:
            # Send current stage states immediately
            sb = get_supabase()
            stages = (
                sb.table("pipeline_stages")
                .select("*")
                .eq("project_id", project_id)
                .order("stage_number")
                .order("version", desc=True)
                .execute()
            ).data
            yield f"data: {json.dumps({'type': 'init', 'stages': stages})}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            listeners = _sse_listeners.get(project_id, [])
            if queue in listeners:
                listeners.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
