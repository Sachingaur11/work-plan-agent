"""
Pipeline service — wraps the three Anthropic managed-agent stages.

Each stage can be triggered independently and supports re-runs with
feedback injected as additional context.
"""
from __future__ import annotations

import io
import os
import pathlib
import httpx
from anthropic import Anthropic
from datetime import datetime, timezone

from services.supabase_client import get_supabase

# ── Anthropic client ──────────────────────────────────────────────────────────

_anthropic: Anthropic | None = None


def _get_anthropic() -> Anthropic:
    global _anthropic
    if _anthropic is None:
        _anthropic = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _anthropic


# ── Stage metadata ────────────────────────────────────────────────────────────

STAGE_META = {
    1: {
        "name": "Questionnaire",
        "agent_env_var": "AGENT_ID_1",
        "title": "presale-intake",
        "outputs": ["01_questionnaire.md", "context_v1_intake.json"],
        "context_files": ["context_v1_intake.json"],
    },
    2: {
        "name": "Scope of Work",
        "agent_env_var": "SOW_AGENT_ID",
        "title": "sow-generation",
        "input_files": ["01_questionnaire.md", "context_v1_intake.json"],
        "outputs": ["02_scope_of_work.md", "02_scope_of_work.docx", "context_v2_sow.json"],
        "context_files": ["context_v2_sow.json"],
        "message": (
            "Read the input files from /mnt/session/uploads/, then produce "
            "02_scope_of_work.md, context_v2_sow.json, and 02_scope_of_work.docx "
            "in /mnt/session/outputs/."
        ),
    },
    3: {
        "name": "Development Plan",
        "agent_env_var": "DEV_PLAN_AGENT_ID",
        "title": "dev-plan-generation",
        "input_files": ["02_scope_of_work.md", "context_v2_sow.json"],
        "outputs": ["03_development_plan_and_costing.xlsx", "context_v3_development_plan.json"],
        "context_files": ["context_v3_development_plan.json"],
        "message": (
            "Read the input files from /mnt/session/uploads/, then produce "
            "03_development_plan_and_costing.xlsx and context_v3_development_plan.json "
            "in /mnt/session/outputs/."
        ),
    },
}


# ── Low-level Anthropic helpers (ported from main.py) ────────────────────────

def _mime_for(filename: str) -> str:
    ext = pathlib.Path(filename).suffix.lower()
    return {
        ".md":   "text/markdown",
        ".json": "application/json",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }.get(ext, "application/octet-stream")


def _upload_to_anthropic(filename: str, content: bytes) -> str:
    """Upload bytes to Anthropic Files API, return file_id."""
    client = _get_anthropic()
    meta = client.beta.files.upload(
        file=(filename, io.BytesIO(content), _mime_for(filename)),
        betas=["files-api-2025-04-14"],
    )
    return meta.id


_TERMINAL_SESSION_STATUSES = {
    "session.status_idle",
    "session.status_error",
    "session.status_terminated",
    "session.status_complete",
}


def _run_session(
    agent_id: str,
    title: str,
    message: str,
    resources: list,
    agent_version: int | None = None,
) -> str:
    """Create a managed-agent session, stream until a terminal status, return session_id.

    Breaks on any terminal session status (idle, error, terminated, complete) so
    that stages which finish with a non-idle status don't hang or raise spuriously.
    Stream exceptions are suppressed because session_id is captured before streaming
    starts — the download step that follows will surface any real failures.

    When agent_version is provided the session is pinned to that exact agent
    version, enabling staged rollouts and version comparison.
    """
    client = _get_anthropic()
    environment_id = os.environ["ENVIRONMENT_ID"]

    # Pin to a specific version when requested; otherwise pass bare agent_id
    agent_param: str | dict = (
        {"type": "agent", "id": agent_id, "version": agent_version}
        if agent_version is not None
        else agent_id
    )

    session = client.beta.sessions.create(
        agent=agent_param,
        environment_id=environment_id,
        title=title,
        resources=resources,
    )
    session_id = session.id

    try:
        with client.beta.sessions.events.stream(session_id) as stream:
            client.beta.sessions.events.send(
                session_id,
                events=[{
                    "type": "user.message",
                    "content": [{"type": "text", "text": message}],
                }],
            )
            for event in stream:
                if event.type in _TERMINAL_SESSION_STATUSES:
                    break
    except Exception:
        # The agent may have completed successfully before the stream error.
        # session_id is valid; proceed to the download step which will validate
        # whether the expected files were actually produced.
        pass

    return session_id


def _download_session_files(session_id: str) -> dict[str, bytes]:
    """Download all output files from a session. Returns {filename: bytes}."""
    client = _get_anthropic()
    resp = httpx.get(
        f"https://api.anthropic.com/v1/files?session_id={session_id}",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "managed-agents-2026-04-01,files-api-2025-04-14",
        },
    )
    resp.raise_for_status()

    ALLOWED_EXTENSIONS = {".md", ".json", ".docx", ".xlsx", ".pdf", ".txt", ".csv"}

    files: dict[str, bytes] = {}
    for f in resp.json().get("data", []):
        filename = f["filename"]
        # Skip lock files, temp files, and non-allowed extensions
        if filename.startswith(".~lock.") or filename.startswith("."):
            continue
        ext = pathlib.Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        try:
            content = client.beta.files.download(f["id"])
            files[filename] = content.read()
        except Exception:
            pass  # input files are not downloadable — skip silently
    return files


# ── Supabase Storage helpers ──────────────────────────────────────────────────

BUCKET = "presale-outputs"


def _storage_path(project_id: str, version: int, filename: str) -> str:
    return f"{project_id}/v{version}/{filename}"


def _upload_to_storage(project_id: str, version: int, filename: str, content: bytes) -> str:
    """Upload bytes to Supabase Storage. Returns the storage path."""
    sb = get_supabase()
    path = _storage_path(project_id, version, filename)
    sb.storage.from_(BUCKET).upload(
        path=path,
        file=content,
        file_options={"content-type": _mime_for(filename), "upsert": "true"},
    )
    return path


def _download_from_storage(storage_path: str) -> bytes:
    sb = get_supabase()
    return sb.storage.from_(BUCKET).download(storage_path)


def get_signed_url(storage_path: str, expires_in: int = 3600) -> str:
    sb = get_supabase()
    result = sb.storage.from_(BUCKET).create_signed_url(storage_path, expires_in)
    return result["signedURL"]


# ── Main entry point ──────────────────────────────────────────────────────────

def run_stage(
    project_id: str,
    stage_number: int,
    feedback_comments: list[str] | None = None,
    agent_version: int | None = None,
) -> dict:
    """
    Run a pipeline stage for a project.

    - stage_number: 1, 2, or 3
    - feedback_comments: list of comment strings injected into the agent message on re-runs
    - agent_version: optional version pin passed to the Anthropic session

    Returns the created pipeline_stage row dict.
    """
    sb = get_supabase()
    meta = STAGE_META[stage_number]
    agent_id = os.environ[meta["agent_env_var"]]

    # Determine version (next after existing)
    existing = (
        sb.table("pipeline_stages")
        .select("version")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    version = (existing.data[0]["version"] + 1) if existing.data else 1

    # Insert pipeline_stage row (status=running)
    stage_row = (
        sb.table("pipeline_stages")
        .insert({
            "project_id": project_id,
            "stage_number": stage_number,
            "stage_name": meta["name"],
            "status": "running",
            "version": version,
            "agent_version": agent_version,
            "started_at": datetime.now(timezone.utc).isoformat(),
        })
        .execute()
    ).data[0]
    stage_id = stage_row["id"]

    # Update project status → running
    sb.table("projects").update({"status": "running"}).eq("id", project_id).execute()

    try:
        resources = []

        if stage_number == 1:
            # Fetch transcript from project
            project = (
                sb.table("projects")
                .select("transcript, transcript_file_path")
                .eq("id", project_id)
                .single()
                .execute()
            ).data

            if project.get("transcript"):
                message = project["transcript"]
            elif project.get("transcript_file_path"):
                content = _download_from_storage(project["transcript_file_path"])
                message = content.decode("utf-8", errors="replace")
            else:
                raise ValueError("Project has no transcript")

        else:
            # Fetch output files from previous stage (latest version)
            prev_stage = stage_number - 1
            prev_docs = (
                sb.table("documents")
                .select("*")
                .eq("project_id", project_id)
                .eq("stage_number", prev_stage)
                .eq("is_latest", True)
                .execute()
            ).data

            prev_files: dict[str, bytes] = {}
            for doc in prev_docs:
                content = _download_from_storage(doc["storage_path"])
                prev_files[doc["filename"]] = content

            for filename in meta["input_files"]:
                if filename not in prev_files:
                    raise RuntimeError(f"Stage {prev_stage} did not produce {filename}")
                file_id = _upload_to_anthropic(filename, prev_files[filename])
                resources.append({
                    "type": "file",
                    "file_id": file_id,
                    "mount_path": f"/mnt/session/uploads/{filename}",
                })

            message = meta["message"]

        # Inject feedback if provided
        if feedback_comments:
            feedback_block = "\n\nPrevious output was reviewed. Please incorporate this feedback:\n"
            feedback_block += "\n".join(f"- {c}" for c in feedback_comments)
            message = message + feedback_block

        # Run the agent session (optionally pinned to a specific version)
        session_id = _run_session(
            agent_id=agent_id,
            title=f"{meta['title']}-v{version}",
            message=message,
            resources=resources,
            agent_version=agent_version,
        )

        # Update stage with session_id
        sb.table("pipeline_stages").update({"anthropic_session_id": session_id}).eq("id", stage_id).execute()

        # Download outputs
        output_files = _download_session_files(session_id)

        # Validate the agent produced the expected output files
        missing = [f for f in meta["outputs"] if f not in output_files]
        if missing:
            raise RuntimeError(
                f"Stage {stage_number} agent session completed but expected output files "
                f"were not found: {missing}. Files present in session: {list(output_files.keys())}"
            )

        # Mark previous document versions as not latest
        if version > 1:
            sb.table("documents").update({"is_latest": False}).eq("project_id", project_id).eq("stage_number", stage_number).execute()

        # Upload to Supabase Storage + insert document rows
        for filename, content in output_files.items():
            storage_path = _upload_to_storage(project_id, version, filename, content)
            is_ctx = filename in meta.get("context_files", [])
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
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", stage_id).execute()

        # Update project status → awaiting_review
        sb.table("projects").update({"status": "awaiting_review"}).eq("id", project_id).execute()

        return (
            sb.table("pipeline_stages")
            .select("*")
            .eq("id", stage_id)
            .single()
            .execute()
        ).data

    except Exception as exc:
        # Mark stage failed
        sb.table("pipeline_stages").update({
            "status": "failed",
            "error_message": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", stage_id).execute()
        sb.table("projects").update({"status": "awaiting_review"}).eq("id", project_id).execute()
        raise


# ── File regeneration ─────────────────────────────────────────────────────────

def regenerate_files(
    project_id: str,
    stage_number: int,
    file_names: list[str],
    instructions: str,
    agent_version: int | None = None,
) -> dict:
    """
    Regenerate a subset of output files for a stage using targeted instructions.

    - file_names: filenames to regenerate; pass [] to regenerate all stage outputs.
    - instructions: user-supplied instructions injected into the agent message.
    - agent_version: optional version pin.

    Creates a new pipeline_stages version row. Only the regenerated filenames
    are marked is_latest=False in previous versions; other files are untouched.
    Returns the new pipeline_stage row dict.
    """
    sb = get_supabase()
    meta = STAGE_META[stage_number]
    agent_id = os.environ[meta["agent_env_var"]]

    # Target files: default to all stage outputs when none specified
    target_files: list[str] = file_names if file_names else list(meta["outputs"])

    # Determine next version
    existing = (
        sb.table("pipeline_stages")
        .select("version")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    version = (existing.data[0]["version"] + 1) if existing.data else 1

    # Insert pipeline_stage row (status=running)
    stage_row = (
        sb.table("pipeline_stages")
        .insert({
            "project_id": project_id,
            "stage_number": stage_number,
            "stage_name": meta["name"],
            "status": "running",
            "version": version,
            "agent_version": agent_version,
            "started_at": datetime.now(timezone.utc).isoformat(),
        })
        .execute()
    ).data[0]
    stage_id = stage_row["id"]

    sb.table("projects").update({"status": "running"}).eq("id", project_id).execute()

    try:
        resources = []

        if stage_number == 1:
            project = (
                sb.table("projects")
                .select("transcript, transcript_file_path")
                .eq("id", project_id)
                .single()
                .execute()
            ).data
            if project.get("transcript"):
                base_message = project["transcript"]
            elif project.get("transcript_file_path"):
                content = _download_from_storage(project["transcript_file_path"])
                base_message = content.decode("utf-8", errors="replace")
            else:
                raise ValueError("Project has no transcript")
        else:
            prev_stage = stage_number - 1
            prev_docs = (
                sb.table("documents")
                .select("*")
                .eq("project_id", project_id)
                .eq("stage_number", prev_stage)
                .eq("is_latest", True)
                .execute()
            ).data
            prev_files: dict[str, bytes] = {}
            for doc in prev_docs:
                content = _download_from_storage(doc["storage_path"])
                prev_files[doc["filename"]] = content
            for filename in meta["input_files"]:
                if filename not in prev_files:
                    raise RuntimeError(f"Stage {prev_stage} did not produce {filename}")
                file_id = _upload_to_anthropic(filename, prev_files[filename])
                resources.append({
                    "type": "file",
                    "file_id": file_id,
                    "mount_path": f"/mnt/session/uploads/{filename}",
                })
            base_message = meta["message"]

        # Build targeted regeneration message
        target_list = ", ".join(target_files)
        message = (
            f"{base_message}\n\n"
            f"IMPORTANT: Regenerate ONLY the following file(s): {target_list}\n"
            f"Apply these specific instructions:\n{instructions}\n\n"
            f"Output the regenerated file(s) to /mnt/session/outputs/ "
            f"using the exact same filenames."
        )

        session_id = _run_session(
            agent_id=agent_id,
            title=f"{meta['title']}-regen-v{version}",
            message=message,
            resources=resources,
            agent_version=agent_version,
        )

        sb.table("pipeline_stages").update({"anthropic_session_id": session_id}).eq("id", stage_id).execute()

        output_files = _download_session_files(session_id)

        # Validate the agent produced the requested files
        missing = [f for f in target_files if f not in output_files]
        if missing:
            raise RuntimeError(
                f"Regeneration for stage {stage_number} completed but requested files "
                f"were not found: {missing}. Files present in session: {list(output_files.keys())}"
            )

        # Mark only the targeted filenames as not-latest in previous versions
        for fname in target_files:
            sb.table("documents").update({"is_latest": False}).eq(
                "project_id", project_id
            ).eq("stage_number", stage_number).eq("filename", fname).execute()

        # Upload regenerated files and insert new document rows
        for filename, content in output_files.items():
            storage_path = _upload_to_storage(project_id, version, filename, content)
            is_ctx = filename in meta.get("context_files", [])
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

        sb.table("pipeline_stages").update({
            "status": "complete",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", stage_id).execute()

        sb.table("projects").update({"status": "awaiting_review"}).eq("id", project_id).execute()

        return (
            sb.table("pipeline_stages")
            .select("*")
            .eq("id", stage_id)
            .single()
            .execute()
        ).data

    except Exception as exc:
        sb.table("pipeline_stages").update({
            "status": "failed",
            "error_message": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", stage_id).execute()
        sb.table("projects").update({"status": "awaiting_review"}).eq("id", project_id).execute()
        raise
