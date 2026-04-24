-- Migration 002: agent version tracking
-- Run this in the Supabase SQL editor after 001_init.sql

-- Track which Anthropic agent version was used for each pipeline stage run.
-- NULL means the latest version was used (no pinning).
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS agent_version integer;

COMMENT ON COLUMN pipeline_stages.agent_version IS
  'Pinned Anthropic agent version (1–5). NULL = unpinned / latest.';
