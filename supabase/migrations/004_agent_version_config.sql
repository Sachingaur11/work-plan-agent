-- ============================================================
-- Agent version config — persists admin-enabled versions
-- across server restarts.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_version_config (
  stage_number  INT NOT NULL CHECK (stage_number IN (1, 2, 3, 4)),
  version       INT NOT NULL CHECK (version BETWEEN 1 AND 5),
  PRIMARY KEY (stage_number, version)
);

-- Seed V1 as the default enabled version for every stage.
-- ON CONFLICT DO NOTHING is safe to re-run.
INSERT INTO agent_version_config (stage_number, version) VALUES
  (1, 1),
  (2, 1),
  (3, 1),
  (4, 1)
ON CONFLICT DO NOTHING;
