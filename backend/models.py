from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    transcript: Optional[str] = None  # pasted text


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[EmailStr] = None
    transcript: Optional[str] = None  # updating transcript allows re-running stage 1 with new input


class ProjectResponse(BaseModel):
    id: str
    name: str
    client_name: Optional[str]
    client_email: Optional[str]
    status: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Pipeline ──────────────────────────────────────────────────────────────────

class RunPipelineRequest(BaseModel):
    stage_number: int  # 1, 2, or 3
    rerun: bool = False  # true = re-run same stage with feedback
    agent_version: Optional[int] = None  # pin to a specific agent version (1–5); None = use latest


class RegenerateFilesRequest(BaseModel):
    file_names: list[str]  # filenames to regenerate; empty list = regenerate all stage outputs
    instructions: str      # user instructions injected into the agent message
    agent_version: Optional[int] = None  # optional version pin, same as RunPipelineRequest


class VerifyDownloadRequest(BaseModel):
    session_id: Optional[str] = None  # provide manually if the DB row has no session_id stored


class PipelineStageResponse(BaseModel):
    id: str
    project_id: str
    stage_number: int
    stage_name: str
    status: str
    version: int
    anthropic_session_id: Optional[str]
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    project_id: str
    stage_number: int
    filename: str
    storage_path: str
    version: int
    is_latest: bool
    is_context_file: bool
    created_at: datetime


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    content: str
    document_id: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    project_id: str
    stage_number: int
    document_id: Optional[str]
    author_id: Optional[str]
    author_name: Optional[str]
    content: str
    resolved: bool
    created_at: datetime


# ── Approvals ─────────────────────────────────────────────────────────────────

class ApprovalCreate(BaseModel):
    decision: str  # 'approved' | 'revision_requested' | 'rejected'
    comment: Optional[str] = None


class ApprovalResponse(BaseModel):
    id: str
    project_id: str
    stage_number: int
    decided_by: Optional[str]
    decision: str
    comment: Optional[str]
    created_at: datetime


# ── Users / Admin ─────────────────────────────────────────────────────────────

class UserRoleUpdate(BaseModel):
    role: str  # 'admin' | 'presales' | 'client'


class AssignClientRequest(BaseModel):
    client_id: str


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatHistoryItem(BaseModel):
    role: str     # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    stage_number: int
    history: list[ChatHistoryItem] = []


class UserProfileResponse(BaseModel):
    id: str
    full_name: Optional[str]
    role: str
    company: Optional[str]
    email: Optional[str]
    created_at: Optional[datetime]
