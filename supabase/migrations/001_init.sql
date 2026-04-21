-- ============================================================
-- Presale Agent Dashboard — Initial Schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. User profiles (extends Supabase auth.users)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  role      TEXT NOT NULL DEFAULT 'presales'
              CHECK (role IN ('admin', 'presales', 'client')),
  company   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create a profile row on new Supabase Auth sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'presales')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ----------------------------------------------------------------
-- 2. Projects
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  client_name          TEXT,
  client_email         TEXT,
  transcript           TEXT,
  transcript_file_path TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'running', 'awaiting_review',
      'revision_requested', 'approved', 'rejected', 'complete'
    )),
  created_by  UUID REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ----------------------------------------------------------------
-- 3. Client ↔ Project access
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_project_access (
  client_id  UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, project_id)
);

-- ----------------------------------------------------------------
-- 4. Pipeline stages
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_number          INT NOT NULL CHECK (stage_number IN (1, 2, 3)),
  stage_name            TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  anthropic_session_id  TEXT,
  version               INT NOT NULL DEFAULT 1,
  error_message         TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  UNIQUE (project_id, stage_number, version)
);

-- ----------------------------------------------------------------
-- 5. Generated documents
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id         UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  stage_number     INT NOT NULL,
  filename         TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  version          INT NOT NULL DEFAULT 1,
  is_latest        BOOLEAN NOT NULL DEFAULT true,
  is_context_file  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Index to quickly find latest docs for a project/stage
CREATE INDEX IF NOT EXISTS idx_documents_project_stage
  ON documents(project_id, stage_number, is_latest);

-- ----------------------------------------------------------------
-- 6. Feedback / comments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_number INT NOT NULL,
  document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  author_id    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  content      TEXT NOT NULL,
  resolved     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------
-- 7. Approvals
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_number INT NOT NULL,
  decided_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  decision     TEXT NOT NULL
    CHECK (decision IN ('approved', 'revision_requested', 'rejected')),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ================================================================

ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_project_access  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback               ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals              ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION current_role_name()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- ---- user_profiles ----
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admin reads all profiles"
  ON user_profiles FOR SELECT USING (current_role_name() = 'admin');

CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admin updates any profile"
  ON user_profiles FOR UPDATE USING (current_role_name() = 'admin');

-- ---- projects ----
-- Admin/Presales: full access to all projects
CREATE POLICY "Staff read all projects"
  ON projects FOR SELECT
  USING (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Staff insert projects"
  ON projects FOR INSERT
  WITH CHECK (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Staff update projects"
  ON projects FOR UPDATE
  USING (current_role_name() IN ('admin', 'presales'));

-- Clients: only their assigned projects
CREATE POLICY "Client reads assigned projects"
  ON projects FOR SELECT
  USING (
    current_role_name() = 'client'
    AND id IN (
      SELECT project_id FROM client_project_access
      WHERE client_id = auth.uid()
    )
  );

-- ---- client_project_access ----
CREATE POLICY "Admin manages access"
  ON client_project_access FOR ALL
  USING (current_role_name() = 'admin');

CREATE POLICY "Client reads own access"
  ON client_project_access FOR SELECT
  USING (client_id = auth.uid());

-- ---- pipeline_stages ----
CREATE POLICY "Staff access pipeline stages"
  ON pipeline_stages FOR ALL
  USING (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Client reads stages for their projects"
  ON pipeline_stages FOR SELECT
  USING (
    current_role_name() = 'client'
    AND project_id IN (
      SELECT project_id FROM client_project_access WHERE client_id = auth.uid()
    )
  );

-- ---- documents ----
CREATE POLICY "Staff access all documents"
  ON documents FOR ALL
  USING (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Client reads non-context docs for approved stages"
  ON documents FOR SELECT
  USING (
    current_role_name() = 'client'
    AND is_context_file = false
    AND project_id IN (
      SELECT project_id FROM client_project_access WHERE client_id = auth.uid()
    )
    AND stage_id IN (
      SELECT ps.id FROM pipeline_stages ps
      JOIN approvals a ON a.project_id = ps.project_id AND a.stage_number = ps.stage_number
      WHERE a.decision = 'approved'
    )
  );

-- ---- feedback ----
CREATE POLICY "Staff access all feedback"
  ON feedback FOR ALL
  USING (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Client reads and writes feedback on their projects"
  ON feedback FOR ALL
  USING (
    current_role_name() = 'client'
    AND project_id IN (
      SELECT project_id FROM client_project_access WHERE client_id = auth.uid()
    )
  );

-- ---- approvals ----
CREATE POLICY "Staff access all approvals"
  ON approvals FOR ALL
  USING (current_role_name() IN ('admin', 'presales'));

CREATE POLICY "Client reads approvals on their projects"
  ON approvals FOR SELECT
  USING (
    current_role_name() = 'client'
    AND project_id IN (
      SELECT project_id FROM client_project_access WHERE client_id = auth.uid()
    )
  );
