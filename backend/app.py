import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from .routers import projects, pipeline, feedback, approvals, files, admin
from .services.supabase_client import get_supabase

app = FastAPI(title="Presale Agent Dashboard API", version="1.0.0")

_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
_allowed_origins = [o.strip() for o in _frontend_url.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth middleware ───────────────────────────────────────────────────────────

@app.middleware("http")
async def attach_user(request: Request, call_next):
    """
    Validates the Supabase JWT from Authorization header and attaches
    user_id + user_role to request.state.
    """
    request.state.user_id = None
    request.state.user_role = None

    # Skip auth for health check and docs
    if request.url.path in ("/", "/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return await call_next(request)

    token = auth_header.removeprefix("Bearer ").strip()
    try:
        sb = get_supabase()
        user = sb.auth.get_user(token)
        if user and user.user:
            request.state.user_id = str(user.user.id)
            profile = (
                sb.table("user_profiles")
                .select("role")
                .eq("id", user.user.id)
                .single()
                .execute()
            )
            if profile.data:
                request.state.user_role = profile.data["role"]
    except Exception:
        pass  # Unauthenticated requests handled per-route

    return await call_next(request)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(projects.router)
app.include_router(pipeline.router)
app.include_router(feedback.router)
app.include_router(approvals.router)
app.include_router(files.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
