"""
Agent version handler.

Controls which Anthropic agent versions are available and enabled per pipeline stage.
Config is stored in-memory and resets on server restart. Admins update it via the
/admin/agents/stages endpoints. To make it durable, persist _config to a DB table.

Version numbers are 1-indexed and displayed as V1–V5 in the UI.
"""
from __future__ import annotations

MAX_VERSIONS = 5  # UI always renders V1 through V5

# stage_number → sorted list of enabled version numbers
# Default: only V1 enabled for each stage until admin unlocks more.
_config: dict[int, list[int]] = {
    1: [1],
    2: [1],
    3: [1],
    4: [1],
}


def get_available_versions(stage_number: int) -> list[int]:
    """Return sorted list of enabled version numbers for the given stage."""
    return sorted(_config.get(stage_number, [1]))


def enable_version(stage_number: int, version: int) -> None:
    """Mark a version as available for a stage."""
    if stage_number not in (1, 2, 3, 4):
        raise ValueError("stage_number must be 1, 2, 3, or 4")
    if not (1 <= version <= MAX_VERSIONS):
        raise ValueError(f"Version must be between 1 and {MAX_VERSIONS}")
    bucket = _config.setdefault(stage_number, [])
    if version not in bucket:
        bucket.append(version)
        bucket.sort()


def disable_version(stage_number: int, version: int) -> None:
    """Remove a version from the available list for a stage."""
    if stage_number not in _config:
        return
    remaining = [v for v in _config[stage_number] if v != version]
    if not remaining:
        raise ValueError("Cannot disable all versions — at least one must remain enabled")
    _config[stage_number] = remaining


def get_all_stage_versions() -> dict[int, dict]:
    """
    Return version availability info for all three stages.
    Shape: { stage_number: { available: [int], max_versions: int } }
    Used by GET /agents/versions and the frontend version selector.
    """
    return {
        stage: {
            "available": sorted(_config.get(stage, [])),
            "max_versions": MAX_VERSIONS,
        }
        for stage in (1, 2, 3, 4)
    }
