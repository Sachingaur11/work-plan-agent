import io
import os
import pathlib
import httpx
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

ENVIRONMENT_ID = os.getenv("ENVIRONMENT_ID")
PRESALE_AGENT_ID = os.getenv("AGENT_ID_1")
SOW_AGENT_ID = os.getenv("SOW_AGENT_ID")
DEV_PLAN_AGENT_ID = os.getenv("DEV_PLAN_AGENT_ID")

for name, val in [
    ("ENVIRONMENT_ID", ENVIRONMENT_ID),
    ("AGENT_ID_1 (Presale)", PRESALE_AGENT_ID),
    ("SOW_AGENT_ID", SOW_AGENT_ID),
    ("DEV_PLAN_AGENT_ID", DEV_PLAN_AGENT_ID),
]:
    if not val:
        raise ValueError(f"{name} is not set in .env")

OUTPUT_DIR = pathlib.Path("./final_generated_output")
OUTPUT_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_session(agent_id: str, title: str, message: str, resources: list = None) -> str:
    """Create a session, stream until idle, return session_id."""
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=ENVIRONMENT_ID,
        title=title,
        resources=resources or [],
    )
    session_id = session.id
    print(f"  Session ID: {session_id}")

    with client.beta.sessions.events.stream(session_id) as stream:
        client.beta.sessions.events.send(
            session_id,
            events=[{
                "type": "user.message",
                "content": [{"type": "text", "text": message}],
            }],
        )
        for event in stream:
            match event.type:
                case "agent.message":
                    for block in event.content:
                        print(block.text, end="", flush=True)
                case "agent.tool_use":
                    print(f"\n  [tool: {event.name}]", flush=True)
                case "session.status_idle":
                    print("\n  Agent finished.")
                    break

    return session_id


def download_session_files(session_id: str) -> dict:
    """
    Query /v1/files?session_id=... and download all downloadable output files.
    Returns {filename: bytes}. Input files that are not downloadable are silently skipped.
    """
    resp = httpx.get(
        f"https://api.anthropic.com/v1/files?session_id={session_id}",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "managed-agents-2026-04-01,files-api-2025-04-14",
        },
    )
    resp.raise_for_status()

    files = {}
    for f in resp.json().get("data", []):
        filename = f["filename"]
        file_id = f["id"]
        try:
            content = client.beta.files.download(file_id)
            files[filename] = content.read()
            print(f"  Downloaded: {filename} ({len(files[filename]) / 1024:.1f} KB)")
        except Exception:
            pass  # input files are not downloadable — skip silently

    return files


def upload_file(filename: str, content: bytes, mime: str) -> str:
    """Upload bytes to Files API and return file_id."""
    meta = client.beta.files.upload(
        file=(filename, io.BytesIO(content), mime),
        betas=["files-api-2025-04-14"],
    )
    return meta.id


def save_files(files: dict):
    """Write files to OUTPUT_DIR."""
    for filename, content in files.items():
        out_path = OUTPUT_DIR / filename
        out_path.write_bytes(content)


def mime_for(filename: str) -> str:
    ext = pathlib.Path(filename).suffix.lower()
    return {
        ".md":   "text/markdown",
        ".json": "application/json",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }.get(ext, "application/octet-stream")


# ---------------------------------------------------------------------------
# Input brief — replace or load from file as needed
# ---------------------------------------------------------------------------

INPUT_BRIEF = """
AI Recruitment System – Discovery Call Transcript (~30 mins)

Participants:
Rahul (Client – HR Lead)
Ankit (Presales Consultant)
Neha (AI Solutions Architect)
Karan (Product Manager)

Ankit: Hi Rahul, thanks for taking the time today. I understand you're exploring an AI-based recruitment system. Would love to hear more in detail—maybe you can walk us through your current process?

Rahul: Sure. So right now, everything is mostly manual. Candidates apply through our careers page or via job portals, and resumes come into Zoho Recruit. Our recruiters then screen resumes manually, shortlist candidates, and schedule interviews.

Neha: Got it. Roughly how many applications are you handling on a daily basis?

Rahul: On average, around 200 to 300 applications per day. Sometimes even more depending on the role.

Karan: That's quite a volume. And how big is your recruiting team handling this?

Rahul: We have about 5–6 recruiters. But honestly, they're overwhelmed. Screening itself takes most of their time.

Ankit: Makes sense. So the primary pain point is the manual screening and missing out on good candidates, right?

Rahul: Exactly. Because of time constraints, recruiters often just skim resumes. We feel like we're probably missing strong candidates.

Neha: Understood. When you say "evaluate candidates," what criteria do you typically use today?

Rahul: Mostly experience, skills mentioned in the resume, education, and sometimes company background. But it's not very structured—it depends on the recruiter.

Karan: So no standardized scoring or ranking system yet?

Rahul: No, not really. That's something we'd like to introduce.

Ankit: Okay. So ideally, you'd want a system that takes in resumes, matches them against job descriptions, and scores or ranks candidates. Is that correct?

Rahul: Yes, that's exactly what we're thinking.

Neha: Would you also want explainability? Like why a candidate was ranked higher or lower?

Rahul: Yes, that would be helpful. Recruiters should trust the system.

Karan: Makes sense. Now, you also mentioned initial screening—can you elaborate?

Rahul: Yeah, so maybe after applying, candidates could answer a few questions. Could be technical or behavioral. Maybe even some AI-based interaction.

Ankit: Like a chatbot or automated interview?

Rahul: Yes, something like that. Even basic filtering questions would help.

Neha: Would these questions vary by role?

Rahul: Definitely. A developer role would need different questions than, say, a marketing role.

Karan: And do you want this to be synchronous (real-time chat) or asynchronous (candidate answers at their own time)?

Rahul: Asynchronous would be better for now.

Ankit: Got it. Let's talk about integrations. You're currently using Zoho Recruit—how critical is it to continue using that?

Rahul: We're open. If integration is possible, that's great. Otherwise, we can consider alternatives.

Neha: Would you prefer a system that integrates with Zoho, or a completely new platform replacing Zoho?

Rahul: Ideally integrate first. But if the new system is significantly better, we can switch.

Karan: Now regarding the dashboard—what kind of visibility do you want?

Rahul: We want HR to see candidate status, rankings or scores, and filters based on skills and experience.

Ankit: Would you also want analytics like hiring funnel metrics?

Rahul: Yes, conversion rates, time to hire, drop-offs—that would be great.

Karan: Any preferences or constraints around data privacy, model hosting?

Rahul: Data privacy is important. Cloud is fine as long as it's secure.

Ankit: How would you define success?

Rahul: If the system can shortlist candidates similarly or better than our recruiters, that's a win.

Neha: Would you be open to a feedback loop? Like recruiters correcting the system over time?

Rahul: Yes, that would actually be great.

Ankit: About timeline—you mentioned 2–3 months. Is that a hard deadline?

Rahul: Yes, we'd like at least a working version by then. MVP first, then enhancements.

Karan: For MVP, what would be your top priorities?

Rahul: Resume parsing, candidate scoring/ranking, basic dashboard.

Neha: What formats do resumes usually come in?

Rahul: Mostly PDFs and Word docs.

Karan: And do candidates apply only via your portal or also from external job boards?

Rahul: Both. LinkedIn, Naukri, and our careers page.

Ankit: Thanks Rahul, this was really helpful.

Rahul: Thanks everyone!
"""


# ---------------------------------------------------------------------------
# Stage 1 — Presale Agent
# ---------------------------------------------------------------------------

print("=" * 60)
print("STAGE 1 — Presale Agent")
print("=" * 60)

presale_session_id = run_session(
    agent_id=PRESALE_AGENT_ID,
    title="presale-intake",
    message=INPUT_BRIEF,
)

print("\nDownloading Stage 1 outputs...")
stage1_files = download_session_files(presale_session_id)
save_files(stage1_files)


# ---------------------------------------------------------------------------
# Stage 2 — SOW Agent
# ---------------------------------------------------------------------------

print("\n" + "=" * 60)
print("STAGE 2 — SOW Agent")
print("=" * 60)

sow_resources = []
for filename in ("01_questionnaire.md", "context_v1_intake.json"):
    if filename not in stage1_files:
        raise RuntimeError(f"Stage 1 did not produce {filename} — cannot continue")
    file_id = upload_file(filename, stage1_files[filename], mime_for(filename))
    sow_resources.append({
        "type": "file",
        "file_id": file_id,
        "mount_path": f"/mnt/session/uploads/{filename}",
    })
    print(f"  Mounted: {filename} → {file_id}")

sow_session_id = run_session(
    agent_id=SOW_AGENT_ID,
    title="sow-generation",
    message=(
        "Read the input files from /mnt/session/uploads/, then produce "
        "02_scope_of_work.md, context_v2_sow.json, and 02_scope_of_work.docx "
        "in /mnt/session/outputs/."
    ),
    resources=sow_resources,
)

print("\nDownloading Stage 2 outputs...")
stage2_files = download_session_files(sow_session_id)
save_files(stage2_files)


# ---------------------------------------------------------------------------
# Stage 3 — Development Plan Agent
# ---------------------------------------------------------------------------

print("\n" + "=" * 60)
print("STAGE 3 — Development Plan Agent")
print("=" * 60)

dev_resources = []
for filename in ("02_scope_of_work.md", "context_v2_sow.json"):
    if filename not in stage2_files:
        raise RuntimeError(f"Stage 2 did not produce {filename} — cannot continue")
    file_id = upload_file(filename, stage2_files[filename], mime_for(filename))
    dev_resources.append({
        "type": "file",
        "file_id": file_id,
        "mount_path": f"/mnt/session/uploads/{filename}",
    })
    print(f"  Mounted: {filename} → {file_id}")

dev_plan_session_id = run_session(
    agent_id=DEV_PLAN_AGENT_ID,
    title="dev-plan-generation",
    message=(
        "Read the input files from /mnt/session/uploads/, then produce "
        "03_development_plan_and_costing.xlsx and context_v3_development_plan.json "
        "in /mnt/session/outputs/."
    ),
    resources=dev_resources,
)

print("\nDownloading Stage 3 outputs...")
stage3_files = download_session_files(dev_plan_session_id)
save_files(stage3_files)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print("\n" + "=" * 60)
print("PIPELINE COMPLETE")
print("=" * 60)
for f in sorted(OUTPUT_DIR.iterdir()):
    size_kb = f.stat().st_size / 1024
    print(f"  {f.name} ({size_kb:.1f} KB)")
print(f"\nAll files saved to {OUTPUT_DIR}/")
