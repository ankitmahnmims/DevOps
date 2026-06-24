const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getTargetPool } = require('./servers');

const router = express.Router();

router.use(authenticate);

router.get('/:serverId/databases', async (req, res) => {
  const targetPool = await getTargetPool(req.params.serverId);
  try {
    const { rows } = await targetPool.query(
      `SELECT datname AS name FROM pg_database
       WHERE datistemplate = false AND datname NOT IN ('postgres', 'rdsadmin')
       ORDER BY datname`
    );
    res.json(rows);
  } finally {
    await targetPool.end();
  }
});

router.get('/:serverId/databases/:dbName/tables', async (req, res) => {
  const targetPool = await getTargetPool(req.params.serverId, req.params.dbName);
  try {
    const { rows } = await targetPool.query(
      `SELECT table_schema AS schema, table_name AS name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name`
    );
    res.json(rows);
  } finally {
    await targetPool.end();
  }
});

router.get('/:serverId/databases/:dbName/roles', async (req, res) => {
  const targetPool = await getTargetPool(req.params.serverId, req.params.dbName);
  try {
    const { rows } = await targetPool.query(
      `SELECT rolname AS name, rolcanlogin AS can_login, rolcreatedb AS can_create_db
       FROM pg_roles
       WHERE rolname NOT LIKE 'pg_%' AND rolname NOT IN ('rds_superuser', 'rdsadmin', 'rdsrepladmin')
       ORDER BY rolname`
    );
    res.json(rows);
  } finally {
    await targetPool.end();
  }
});

module.exports = router;
