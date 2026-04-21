from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from typing import Optional
from ..models import ProjectCreate, ProjectResponse
from ..services.supabase_client import get_supabase
from ..services.pipeline_service import _storage_path, _mime_for, BUCKET

router = APIRouter(prefix="/projects", tags=["projects"])


def _get_user_id(request: Request) -> str:
    uid = request.state.user_id
    if not uid:
        raise HTTPException(401, "Not authenticated")
    return uid


def _get_user_role(request: Request) -> str:
    return getattr(request.state, "user_role", "presales")


@router.post("", response_model=ProjectResponse)
async def create_project(
    request: Request,
    name: str = Form(...),
    client_name: Optional[str] = Form(None),
    client_email: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    transcript_file: Optional[UploadFile] = File(None),
):
    user_id = _get_user_id(request)
    sb = get_supabase()

    transcript_file_path = None

    if transcript_file:
        content = await transcript_file.read()
        path = f"transcripts/{name.replace(' ', '_')}/{transcript_file.filename}"
        sb.storage.from_(BUCKET).upload(
            path=path,
            file=content,
            file_options={"content-type": transcript_file.content_type or "text/plain", "upsert": "true"},
        )
        transcript_file_path = path

    row = sb.table("projects").insert({
        "name": name,
        "client_name": client_name,
        "client_email": client_email,
        "transcript": transcript,
        "transcript_file_path": transcript_file_path,
        "created_by": user_id,
        "status": "pending",
    }).execute()

    return row.data[0]


@router.get("", response_model=list[ProjectResponse])
async def list_projects(request: Request):
    user_id = _get_user_id(request)
    role = _get_user_role(request)
    sb = get_supabase()

    if role in ("admin", "presales"):
        result = sb.table("projects").select("*").order("created_at", desc=True).execute()
    else:
        # Client: only their assigned projects
        access = sb.table("client_project_access").select("project_id").eq("client_id", user_id).execute()
        ids = [r["project_id"] for r in access.data]
        if not ids:
            return []
        result = sb.table("projects").select("*").in_("id", ids).order("created_at", desc=True).execute()

    return result.data


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, request: Request):
    _get_user_id(request)
    sb = get_supabase()
    result = sb.table("projects").select("*").eq("id", project_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Project not found")
    return result.data


@router.get("/{project_id}/stages")
async def get_project_stages(project_id: str, request: Request):
    _get_user_id(request)
    sb = get_supabase()
    result = (
        sb.table("pipeline_stages")
        .select("*")
        .eq("project_id", project_id)
        .order("stage_number")
        .order("version", desc=True)
        .execute()
    )
    return result.data


@router.get("/{project_id}/stages/{stage_number}/documents")
async def get_stage_documents(project_id: str, stage_number: int, request: Request):
    role = _get_user_role(request)
    sb = get_supabase()

    query = (
        sb.table("documents")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .eq("is_latest", True)
        .order("created_at")
    )

    if role == "client":
        query = query.eq("is_context_file", False)

    return query.execute().data
