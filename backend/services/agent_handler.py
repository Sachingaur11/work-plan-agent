"""
Agent version handler.

Controls which Anthropic agent versions are available and enabled per pipeline stage.
Config is now persisted in the `agent_version_config` Supabase table so that admin
changes survive server restarts and apply globally across all sessions.

Version numbers are 1-indexed and displayed as V1–V5 in the UI.
"""
from __future__ import annotations

from services.supabase_client import get_supabase

MAX_VERSIONS = 5  # UI always renders V1 through V5


def get_available_versions(stage_number: int) -> list[int]:
    """Return sorted list of enabled version numbers for the given stage."""
    sb = get_supabase()
    rows = (
        sb.table("agent_version_config")
        .select("version")
        .eq("stage_number", stage_number)
        .execute()
    )
    versions = sorted(r["version"] for r in rows.data)
    return versions if versions else [1]


def enable_version(stage_number: int, version: int) -> None:
    """Persist a version as available for a stage."""
    if stage_number not in (1, 2, 3, 4):
        raise ValueError("stage_number must be 1, 2, 3, or 4")
    if not (1 <= version <= MAX_VERSIONS):
        raise ValueError(f"Version must be between 1 and {MAX_VERSIONS}")
    sb = get_supabase()
    sb.table("agent_version_config").upsert(
        {"stage_number": stage_number, "version": version}
    ).execute()


def disable_version(stage_number: int, version: int) -> None:
    """Remove a version from the available list for a stage."""
    # Guard: must leave at least one version enabled
    current = get_available_versions(stage_number)
    remaining = [v for v in current if v != version]
    if not remaining:
        raise ValueError("Cannot disable all versions — at least one must remain enabled")
    sb = get_supabase()
    sb.table("agent_version_config").delete().eq("stage_number", stage_number).eq("version", version).execute()


def get_all_stage_versions() -> dict[int, dict]:
    """
    Return version availability info for all stages.
    Shape: { stage_number: { available: [int], max_versions: int } }
    Used by GET /agents/versions and the frontend version selector.
    """
    sb = get_supabase()
    rows = sb.table("agent_version_config").select("stage_number, version").execute()

    config: dict[int, list[int]] = {1: [], 2: [], 3: [], 4: []}
    for r in rows.data:
        stage = r["stage_number"]
        if stage in config:
            config[stage].append(r["version"])

    # Guarantee at least V1 if a stage has no rows (e.g. before migration runs)
    for stage in (1, 2, 3, 4):
        if not config[stage]:
            config[stage] = [1]

    return {
        stage: {
            "available": sorted(config[stage]),
            "max_versions": MAX_VERSIONS,
        }
        for stage in (1, 2, 3, 4)
    }
