const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const pool = require('../config/database');
const { encrypt, decrypt } = require('../utils/crypto');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.host, s.port, s.db_user, s.ssl_enabled, s.created_at,
            COUNT(sr.id)::int AS role_count
     FROM pg_servers s
     LEFT JOIN server_roles sr ON sr.server_id = s.id
     GROUP BY s.id
     ORDER BY s.name`
  );
  res.json(rows);
});

router.post(
  '/',
  requireAdmin,
  [
    body('name').trim().notEmpty(),
    body('host').trim().notEmpty(),
    body('port').optional().isInt({ min: 1, max: 65535 }),
    body('db_user').trim().notEmpty(),
    body('db_password').notEmpty(),
    body('ssl_enabled').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, host, port = 5432, db_user, db_password, ssl_enabled = false } = req.body;
    const encryptedPassword = encrypt(db_password);

    try {
      const { rows } = await pool.query(
        `INSERT INTO pg_servers (name, host, port, db_user, db_password_encrypted, ssl_enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, host, port, db_user, ssl_enabled, created_at`,
        [name, host, port, db_user, encryptedPassword, ssl_enabled]
      );
      const server = rows[0];

      // Fire-and-forget role sync — don't block the response
      const { syncRoles } = require('../utils/syncRoles');
      syncRoles(server.id).catch(err =>
        console.warn(`[sync] Could not import roles for server ${server.id}:`, err.message)
      );

      res.status(201).json({ ...server, role_count: 0 });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Server name already exists' });
      throw err;
    }
  }
);

router.post('/test-connection', requireAdmin, async (req, res) => {
  const { host, port, db_user, db_password, ssl_enabled } = req.body;
  if (!host || !db_user || !db_password) {
    return res.status(400).json({ success: false, error: 'host, db_user and db_password are required' });
  }
  const testPool = new Pool({
    host,
    port: parseInt(port || 5432),
    user: db_user,
    password: db_password,
    database: 'postgres',
    ssl: ssl_enabled ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 1000,
  });
  try {
    const client = await testPool.connect();
    const { rows } = await client.query('SELECT version()');
    client.release();
    const version = rows[0].version.split(',')[0]; // e.g. "PostgreSQL 15.3"
    res.json({ success: true, version });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  } finally {
    await testPool.end().catch(() => {});
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM pg_servers WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// List imported roles for a server
router.get('/:id/roles', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, rolname, can_login, is_superuser, synced_at
     FROM server_roles WHERE server_id = $1 ORDER BY rolname`,
    [req.params.id]
  );
  res.json(rows);
});

// Manually re-sync roles from the live server
router.post('/:id/sync-roles', requireAdmin, async (req, res) => {
  const { syncRoles } = require('../utils/syncRoles');
  try {
    const count = await syncRoles(req.params.id);
    res.json({ synced: count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function getTargetPool(serverId, dbName = 'postgres') {
  const { rows } = await pool.query(
    'SELECT host, port, db_user, db_password_encrypted, ssl_enabled FROM pg_servers WHERE id = $1',
    [serverId]
  );
  if (!rows.length) throw Object.assign(new Error('Server not found'), { status: 404 });

  const server = rows[0];
  const password = decrypt(server.db_password_encrypted);

  return new Pool({
    host: server.host,
    port: server.port,
    user: server.db_user,
    password,
    database: dbName,
    ssl: server.ssl_enabled ? { rejectUnauthorized: false } : false,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
}

module.exports = { router, getTargetPool };
