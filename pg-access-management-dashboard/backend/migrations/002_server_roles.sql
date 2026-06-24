CREATE TABLE IF NOT EXISTS server_roles (
  id           SERIAL PRIMARY KEY,
  server_id    INTEGER NOT NULL REFERENCES pg_servers(id) ON DELETE CASCADE,
  rolname      VARCHAR(200) NOT NULL,
  can_login    BOOLEAN NOT NULL DEFAULT false,
  is_superuser BOOLEAN NOT NULL DEFAULT false,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (server_id, rolname)
);

CREATE INDEX IF NOT EXISTS idx_server_roles_server ON server_roles (server_id);
