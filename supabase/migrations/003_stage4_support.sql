-- Migration 003: add stage 4 support
-- Run this in the Supabase SQL editor after 002_agent_versioning.sql

-- The original stage_number CHECK only allowed (1, 2, 3).
-- Drop the old constraint and replace it with one that includes stage 4.
ALTER TABLE pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_stage_number_check;

ALTER TABLE pipeline_stages
  ADD CONSTRAINT pipeline_stages_stage_number_check
  CHECK (stage_number IN (1, 2, 3, 4));
