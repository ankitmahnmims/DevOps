const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, is_admin, is_allowed FROM users WHERE username = $1',
      [username]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.is_allowed) {
      return res.status(403).json({ error: 'Your account has been disabled' });
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, is_admin: user.is_admin } });
  }
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
