const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.APP_DB_HOST,
  port: parseInt(process.env.APP_DB_PORT || '5432'),
  database: process.env.APP_DB_NAME,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
  ssl: process.env.APP_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('App DB pool error:', err);
});

module.exports = pool;
