const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const pool = require('../config/database');
const { decrypt } = require('../utils/crypto');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

async function getDbPool(serverId, dbName) {
  const { rows } = await pool.query(
    'SELECT host, port, db_user, db_password_encrypted, ssl_enabled FROM pg_servers WHERE id = $1',
    [serverId]
  );
  if (!rows.length) throw Object.assign(new Error('Server not found'), { status: 404 });

  const server = rows[0];
  return new Pool({
    host: server.host,
    port: server.port,
    user: server.db_user,
    password: decrypt(server.db_password_encrypted),
    database: dbName,
    ssl: server.ssl_enabled ? { rejectUnauthorized: false } : false,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
}

router.get('/', async (req, res) => {
  const { server_id, db_name, pg_role } = req.query;
  let query = `
    SELECT g.id, g.server_id, s.name AS server_name, g.db_name, g.pg_role,
           g.grant_type, g.tables, g.expires_at, g.created_by, g.created_at, g.revoked_at
    FROM grants g
    JOIN pg_servers s ON s.id = g.server_id
    WHERE g.revoked_at IS NULL
  `;
  const values = [];
  if (server_id) { query += ` AND g.server_id = $${values.length + 1}`; values.push(server_id); }
  if (db_name)   { query += ` AND g.db_name = $${values.length + 1}`;   values.push(db_name); }
  if (pg_role)   { query += ` AND g.pg_role ILIKE $${values.length + 1}`; values.push(`%${pg_role}%`); }
  query += ' ORDER BY g.created_at DESC';

  const { rows } = await pool.query(query, values);
  res.json(rows);
});

router.post(
  '/',
  [
    body('server_id').isInt(),
    body('db_name').trim().notEmpty(),
    body('pg_role').trim().notEmpty(),
    body('grant_type').isIn(['all_tables', 'selected_tables']),
    body('tables').optional().isArray(),
    body('expires_at').optional().isISO8601(),
    body('create_role').optional().isBoolean(),
    body('role_password').optional().isString(),
    body('include_update').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { server_id, db_name, pg_role, grant_type, tables = [], expires_at, create_role, role_password, include_update = false } = req.body;

    if (include_update && !expires_at) {
      return res.status(400).json({ error: 'UPDATE permission requires an expiry date.' });
    }

    const dbPool = await getDbPool(server_id, db_name);
    const client = await dbPool.connect();

    try {
      await client.query('BEGIN');

      if (create_role) {
        const escapedRole = pg_role.replace(/[^a-zA-Z0-9_]/g, '');
        if (role_password) {
          const escapedPassword = client.escapeLiteral(role_password);
          await client.query(`CREATE ROLE "${escapedRole}" WITH LOGIN PASSWORD ${escapedPassword}`);
        } else {
          await client.query(`CREATE ROLE "${escapedRole}" WITH LOGIN`);
        }
        await client.query(`GRANT CONNECT ON DATABASE "${db_name}" TO "${escapedRole}"`);
      }

      if (grant_type === 'all_tables') {
        const { rows: schemas } = await client.query(
          `SELECT schema_name FROM information_schema.schemata
           WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`
        );
        for (const { schema_name } of schemas) {
          await client.query(`GRANT USAGE ON SCHEMA "${schema_name}" TO "${pg_role}"`);
          await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schema_name}" TO "${pg_role}"`);
          await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema_name}" GRANT SELECT ON TABLES TO "${pg_role}"`);
          if (include_update) {
            await client.query(`GRANT UPDATE ON ALL TABLES IN SCHEMA "${schema_name}" TO "${pg_role}"`);
            await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema_name}" GRANT UPDATE ON TABLES TO "${pg_role}"`);
          }
        }
      } else {
        const schemas = [...new Set(tables.map(t => t.split('.')[0] || 'public'))];
        for (const schema of schemas) {
          await client.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${pg_role}"`);
        }
        for (const table of tables) {
          const [schema, tname] = table.includes('.') ? table.split('.') : ['public', table];
          await client.query(`GRANT SELECT ON "${schema}"."${tname}" TO "${pg_role}"`);
          if (include_update) {
            await client.query(`GRANT UPDATE ON "${schema}"."${tname}" TO "${pg_role}"`);
          }
        }
      }

      await client.query('COMMIT');

      const { rows } = await pool.query(
        `INSERT INTO grants (server_id, db_name, pg_role, grant_type, tables, expires_at, created_by, include_update)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [server_id, db_name, pg_role, grant_type, JSON.stringify(tables), expires_at || null, req.user.username, include_update]
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
      await dbPool.end();
    }
  }
);

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM grants WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Grant not found' });

  const grant = rows[0];
  await revokeGrant(grant);
  res.status(204).end();
});

async function revokeGrant(grant) {
  const dbPool = await getDbPool(grant.server_id, grant.db_name);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    if (grant.grant_type === 'all_tables') {
      const { rows: schemas } = await client.query(
        `SELECT schema_name FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`
      );
      for (const { schema_name } of schemas) {
        await client.query(`REVOKE SELECT ON ALL TABLES IN SCHEMA "${schema_name}" FROM "${grant.pg_role}"`);
        if (grant.include_update) {
          await client.query(`REVOKE UPDATE ON ALL TABLES IN SCHEMA "${schema_name}" FROM "${grant.pg_role}"`);
        }
        await client.query(`REVOKE USAGE ON SCHEMA "${schema_name}" FROM "${grant.pg_role}"`);
      }
    } else {
      const tables = Array.isArray(grant.tables) ? grant.tables : JSON.parse(grant.tables || '[]');
      for (const table of tables) {
        const [schema, tname] = table.includes('.') ? table.split('.') : ['public', table];
        await client.query(`REVOKE SELECT ON "${schema}"."${tname}" FROM "${grant.pg_role}"`);
        if (grant.include_update) {
          await client.query(`REVOKE UPDATE ON "${schema}"."${tname}" FROM "${grant.pg_role}"`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Failed to revoke grant ${grant.id}:`, err.message);
  } finally {
    client.release();
    await dbPool.end();
  }

  await pool.query('UPDATE grants SET revoked_at = NOW() WHERE id = $1', [grant.id]);
}

module.exports = router;
module.exports.revokeGrant = revokeGrant;
