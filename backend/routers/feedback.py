from fastapi import APIRouter, HTTPException, Request
from ..models import FeedbackCreate, FeedbackResponse
from ..services.supabase_client import get_supabase

router = APIRouter(tags=["feedback"])


@router.post("/projects/{project_id}/stages/{stage_number}/feedback", response_model=FeedbackResponse)
async def add_feedback(project_id: str, stage_number: int, body: FeedbackCreate, request: Request):
    user_id = request.state.user_id
    sb = get_supabase()

    row = sb.table("feedback").insert({
        "project_id": project_id,
        "stage_number": stage_number,
        "document_id": body.document_id,
        "author_id": user_id,
        "content": body.content,
    }).execute()

    item = row.data[0]

    # Enrich with author name
    profile = sb.table("user_profiles").select("full_name").eq("id", user_id).single().execute()
    item["author_name"] = profile.data.get("full_name") if profile.data else None

    return item


@router.get("/projects/{project_id}/stages/{stage_number}/feedback", response_model=list[FeedbackResponse])
async def list_feedback(project_id: str, stage_number: int, request: Request):
    sb = get_supabase()
    rows = (
        sb.table("feedback")
        .select("*, user_profiles(full_name)")
        .eq("project_id", project_id)
        .eq("stage_number", stage_number)
        .order("created_at")
        .execute()
    )

    result = []
    for r in rows.data:
        profile = r.pop("user_profiles", None) or {}
        r["author_name"] = profile.get("full_name")
        result.append(r)
    return result


@router.patch("/feedback/{feedback_id}/resolve")
async def resolve_feedback(feedback_id: str, request: Request):
    sb = get_supabase()
    result = sb.table("feedback").update({"resolved": True}).eq("id", feedback_id).execute()
    if not result.data:
        raise HTTPException(404, "Feedback not found")
    return result.data[0]
