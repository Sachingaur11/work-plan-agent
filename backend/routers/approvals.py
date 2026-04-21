from fastapi import APIRouter, HTTPException, Request
from ..models import ApprovalCreate, ApprovalResponse
from ..services.supabase_client import get_supabase

router = APIRouter(tags=["approvals"])


@router.post("/projects/{project_id}/stages/{stage_number}/approve", response_model=ApprovalResponse)
async def create_approval(
    project_id: str,
    stage_number: int,
    body: ApprovalCreate,
    request: Request,
):
    user_id = request.state.user_id
    role = getattr(request.state, "user_role", "presales")

    if role not in ("admin", "presales"):
        raise HTTPException(403, "Only admin or presales can approve/reject stages")

    sb = get_supabase()

    row = sb.table("approvals").insert({
        "project_id": project_id,
        "stage_number": stage_number,
        "decided_by": user_id,
        "decision": body.decision,
        "comment": body.comment,
    }).execute()

    # Update project status based on decision
    if body.decision == "approved" and stage_number == 3:
        new_status = "complete"
    elif body.decision == "approved":
        new_status = "awaiting_review"
    elif body.decision == "revision_requested":
        new_status = "revision_requested"
    else:  # rejected
        new_status = "rejected"

    sb.table("projects").update({"status": new_status}).eq("id", project_id).execute()

    return row.data[0]


@router.get("/projects/{project_id}/stages/{stage_number}/approve", response_model=list[ApprovalResponse])
async def list_approvals(project_id: str, stage_number: int, request: Request):
    sb = get_supabase()
    result = (
        sb.table("approvals")
        .select("*")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
