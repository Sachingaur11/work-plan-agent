from fastapi import APIRouter, HTTPException, Request
from models import UserRoleUpdate, AssignClientRequest, UserProfileResponse
from services.supabase_client import get_supabase
from services import agent_handler

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(request: Request):
    role = getattr(request.state, "user_role", None)
    if role != "admin":
        raise HTTPException(403, "Admin access required")


@router.get("/users", response_model=list[UserProfileResponse])
async def list_users(request: Request):
    _require_admin(request)
    sb = get_supabase()

    profiles = sb.table("user_profiles").select("*").order("created_at", desc=True).execute()
    # Enrich with email from auth.users via admin API
    auth_users = sb.auth.admin.list_users()
    email_map = {str(u.id): u.email for u in auth_users}

    result = []
    for p in profiles.data:
        p["email"] = email_map.get(p["id"])
        result.append(p)
    return result


@router.post("/users/{user_id}/role")
async def update_user_role(user_id: str, body: UserRoleUpdate, request: Request):
    _require_admin(request)
    sb = get_supabase()
    result = sb.table("user_profiles").update({"role": body.role}).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "User not found")
    return result.data[0]


@router.post("/projects/{project_id}/assign-client")
async def assign_client_to_project(project_id: str, body: AssignClientRequest, request: Request):
    _require_admin(request)
    sb = get_supabase()

    # Verify client exists and has role=client
    profile = sb.table("user_profiles").select("role").eq("id", body.client_id).single().execute()
    if not profile.data:
        raise HTTPException(404, "User not found")
    if profile.data["role"] != "client":
        raise HTTPException(400, "User is not a client")

    sb.table("client_project_access").upsert({
        "client_id": body.client_id,
        "project_id": project_id,
    }).execute()

    return {"status": "assigned"}


@router.delete("/projects/{project_id}/assign-client/{client_id}")
async def remove_client_from_project(project_id: str, client_id: str, request: Request):
    _require_admin(request)
    sb = get_supabase()
    sb.table("client_project_access").delete().eq("project_id", project_id).eq("client_id", client_id).execute()
    return {"status": "removed"}


# ── Agent version management ──────────────────────────────────────────────────

@router.get("/agents/stages/versions")
async def get_stage_versions(request: Request):
    """Return current version availability config for all pipeline stages."""
    _require_admin(request)
    return agent_handler.get_all_stage_versions()


@router.post("/agents/stages/{stage_number}/versions/{version}/enable")
async def enable_agent_version(stage_number: int, version: int, request: Request):
    """Enable an agent version for a pipeline stage (makes it selectable in the UI)."""
    _require_admin(request)
    try:
        agent_handler.enable_version(stage_number, version)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return agent_handler.get_all_stage_versions()[stage_number]


@router.delete("/agents/stages/{stage_number}/versions/{version}")
async def disable_agent_version(stage_number: int, version: int, request: Request):
    """Disable an agent version for a pipeline stage (hides it from the UI)."""
    _require_admin(request)
    try:
        agent_handler.disable_version(stage_number, version)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return agent_handler.get_all_stage_versions()[stage_number]
