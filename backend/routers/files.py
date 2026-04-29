import pathlib
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from services.supabase_client import get_supabase
from services.pipeline_service import get_signed_url

router = APIRouter(tags=["files"])

BUCKET = "presale-outputs"


def _mime_for(filename: str) -> str:
    ext = pathlib.Path(filename).suffix.lower()
    return {
        ".md":   "text/markdown",
        ".json": "application/json",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }.get(ext, "application/octet-stream")


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


@router.get("/documents/{document_id}/content")
async def get_document_content(document_id: str, request: Request):
    """Return raw file bytes — used by the in-browser editor to load content."""
    role = getattr(request.state, "user_role", "presales")
    if role == "client":
        raise HTTPException(403, "Access denied")

    sb = get_supabase()
    doc = sb.table("documents").select("*").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    content = sb.storage.from_(BUCKET).download(doc.data["storage_path"])
    filename = doc.data["filename"]
    return Response(
        content=content,
        media_type=_mime_for(filename),
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.put("/documents/{document_id}/content")
async def update_document_content(
    document_id: str,
    request: Request,
    file: UploadFile = File(...),
):
    """Overwrite a document's content in Supabase Storage."""
    role = getattr(request.state, "user_role", "presales")
    if role == "client":
        raise HTTPException(403, "Clients cannot edit documents")

    sb = get_supabase()
    doc = sb.table("documents").select("*").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(404, "Document not found")

    content = await file.read()
    filename = doc.data["filename"]
    storage_path = doc.data["storage_path"]

    sb.storage.from_(BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": _mime_for(filename), "upsert": "true"},
    )

    return {"success": True}
