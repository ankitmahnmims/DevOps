const jwt = require('jsonwebtoken');
const pool = require('../config/database');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await pool.query(
    'SELECT id, username, is_admin, is_allowed FROM users WHERE id = $1',
    [payload.sub]
  );
  if (!rows.length || !rows[0].is_allowed) {
    return res.status(403).json({ error: 'Access denied' });
  }

  req.user = rows[0];
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
