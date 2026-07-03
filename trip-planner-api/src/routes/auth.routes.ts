import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas.js';

const router = Router();

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount! > 0) {
      return res.status(409).json({ error: { code: 'conflict', message: 'Ya existe un usuario con ese email' } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name]
    );
    const user = result.rows[0];
    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'Email o contraseña incorrectos' } });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'Email o contraseña incorrectos' } });
    }
    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, email, name, avatar_url FROM users WHERE id = $1', [req.user!.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
