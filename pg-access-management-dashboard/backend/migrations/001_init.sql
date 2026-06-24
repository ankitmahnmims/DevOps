-- App users (dashboard login accounts)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  is_allowed    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered PostgreSQL servers
CREATE TABLE IF NOT EXISTS pg_servers (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(200) NOT NULL UNIQUE,
  host                  VARCHAR(255) NOT NULL,
  port                  INTEGER NOT NULL DEFAULT 5432,
  db_user               VARCHAR(100) NOT NULL,
  db_password_encrypted TEXT NOT NULL,
  ssl_enabled           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permission grants (tracks what was granted, to whom, and when it expires)
CREATE TABLE IF NOT EXISTS grants (
  id          SERIAL PRIMARY KEY,
  server_id   INTEGER NOT NULL REFERENCES pg_servers(id) ON DELETE CASCADE,
  db_name     VARCHAR(200) NOT NULL,
  pg_role     VARCHAR(100) NOT NULL,
  grant_type  VARCHAR(20) NOT NULL CHECK (grant_type IN ('all_tables', 'selected_tables')),
  tables      JSONB NOT NULL DEFAULT '[]',
  expires_at  TIMESTAMPTZ,
  created_by  VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_grants_expires_at ON grants (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grants_server_db  ON grants (server_id, db_name);

-- Seed initial admin user: username=admin, password=changeme (change immediately)
-- password_hash is bcrypt of 'changeme' with cost 12
INSERT INTO users (username, password_hash, is_admin, is_allowed)
VALUES ('admin', '$2a$12$G0v2M6Nropa33CndRsDVk.KhWIqDmzXBPQI7MUguDRpIFEsKYPFxG', true, true)
ON CONFLICT (username) DO NOTHING;
