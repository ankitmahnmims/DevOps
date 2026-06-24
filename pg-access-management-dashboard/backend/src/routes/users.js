const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, is_admin, is_allowed, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
});

router.post(
  '/',
  [
    body('username').trim().isLength({ min: 3 }),
    body('password').isLength({ min: 8 }),
    body('is_admin').optional().isBoolean(),
    body('is_allowed').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, is_admin = false, is_allowed = true } = req.body;
    const password_hash = await bcrypt.hash(password, 12);

    try {
      const { rows } = await pool.query(
        'INSERT INTO users (username, password_hash, is_admin, is_allowed) VALUES ($1, $2, $3, $4) RETURNING id, username, is_admin, is_allowed, created_at',
        [username, password_hash, is_admin, is_allowed]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
      throw err;
    }
  }
);

router.patch('/:id', async (req, res) => {
  const { is_allowed, is_admin, password } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (is_allowed !== undefined) { updates.push(`is_allowed = $${idx++}`); values.push(is_allowed); }
  if (is_admin !== undefined) { updates.push(`is_admin = $${idx++}`); values.push(is_admin); }
  if (password) {
    updates.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(password, 12));
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, is_admin, is_allowed`,
    values
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (req.user.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
