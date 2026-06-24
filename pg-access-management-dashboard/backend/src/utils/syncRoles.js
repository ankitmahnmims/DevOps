const pool = require('../config/database');
const { getTargetPool } = require('../routes/servers');

const SYSTEM_ROLES = [
  'pg_monitor', 'pg_read_all_settings', 'pg_read_all_stats',
  'pg_stat_scan_tables', 'pg_read_server_files', 'pg_write_server_files',
  'pg_execute_server_program', 'pg_signal_backend', 'pg_checkpoint',
  'rds_superuser', 'rdsadmin', 'rdsrepladmin', 'rds_replication',
  'rds_password', 'cloudsqlsuperuser',
];

async function syncRoles(serverId) {
  const targetPool = await getTargetPool(serverId);
  let rows;
  try {
    const result = await targetPool.query(
      `SELECT rolname, rolcanlogin AS can_login, rolsuper AS is_superuser
       FROM pg_roles
       WHERE rolname NOT LIKE 'pg_%'
         AND rolname NOT IN (${SYSTEM_ROLES.map((_, i) => `$${i + 1}`).join(',')})
       ORDER BY rolname`,
      SYSTEM_ROLES
    );
    rows = result.rows;
  } finally {
    await targetPool.end();
  }

  // Upsert all found roles
  for (const role of rows) {
    await pool.query(
      `INSERT INTO server_roles (server_id, rolname, can_login, is_superuser, synced_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (server_id, rolname)
       DO UPDATE SET can_login = $3, is_superuser = $4, synced_at = NOW()`,
      [serverId, role.rolname, role.can_login, role.is_superuser]
    );
  }

  // Remove roles that no longer exist on the server
  if (rows.length > 0) {
    const existingNames = rows.map(r => r.rolname);
    await pool.query(
      `DELETE FROM server_roles
       WHERE server_id = $1 AND rolname != ALL($2::text[])`,
      [serverId, existingNames]
    );
  }

  return rows.length;
}

module.exports = { syncRoles };
