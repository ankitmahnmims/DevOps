const cron = require('node-cron');
const pool = require('../config/database');
const { revokeGrant } = require('../routes/grants');

async function revokeExpiredGrants() {
  const { rows } = await pool.query(
    `SELECT * FROM grants
     WHERE revoked_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`
  );

  if (!rows.length) return;

  console.log(`[revocation-worker] Found ${rows.length} expired grant(s) to revoke`);
  for (const grant of rows) {
    try {
      await revokeGrant(grant);
      console.log(`[revocation-worker] Revoked grant ${grant.id} (role: ${grant.pg_role} on ${grant.db_name})`);
    } catch (err) {
      console.error(`[revocation-worker] Failed to revoke grant ${grant.id}:`, err.message);
    }
  }
}

function startRevocationWorker() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    revokeExpiredGrants().catch(err => console.error('[revocation-worker] Error:', err));
  });
  console.log('[revocation-worker] Started — checking for expired grants every 5 minutes');
}

module.exports = { startRevocationWorker, revokeExpiredGrants };
