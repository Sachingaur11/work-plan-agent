from fastapi import APIRouter, HTTPException, Request
from services.supabase_client import get_supabase
from services.pipeline_service import get_signed_url

router = APIRouter(tags=["files"])


@router.get("/documents/{document_id}/download")
async def get_download_url(document_id: str, request: Request):
    sb = get_supabase()
    doc = sb.table("documents").select("*").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    role = getattr(request.state, "user_role", "presales")

    # Clients cannot download context files
    if role == "client" and doc.data.get("is_context_file"):
        raise HTTPException(403, "Access denied")

    signed_url = get_signed_url(doc.data["storage_path"])
    return {"url": signed_url, "filename": doc.data["filename"]}
