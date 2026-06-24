require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function migrate() {
  for (const file of ['001_init.sql', '002_server_roles.sql', '003_grant_update_permission.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations', file), 'utf8');
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }
  console.log('Migration complete');
  await pool.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
