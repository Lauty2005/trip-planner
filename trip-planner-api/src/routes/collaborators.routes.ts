import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { collaboratorCreateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/trips/:tripId/collaborators', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT tc.id, tc.role, u.id AS user_id, u.name, u.email
       FROM trip_collaborators tc JOIN users u ON u.id = tc.user_id
       WHERE tc.trip_id = $1`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Participantes del viaje para dividir gastos (form de Gastos, tab
// Balances) — a diferencia de /collaborators, incluye también al dueño
// del viaje (trips.owner_id nunca tiene fila en trip_collaborators desde
// la migración 20260703150000). Sin esto, un viaje recién creado (solo
// dueño, sin colaboradores invitados todavía) no tendría a quién dividirle
// nada.
router.get('/trips/:tripId/participants', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT user_id, name, email, role FROM (
         SELECT t.owner_id AS user_id, u.name, u.email, 'owner' AS role
         FROM trips t JOIN users u ON u.id = t.owner_id
         WHERE t.id = $1
         UNION ALL
         SELECT tc.user_id, u.name, u.email, tc.role
         FROM trip_collaborators tc JOIN users u ON u.id = tc.user_id
         WHERE tc.trip_id = $1
       ) participants
       ORDER BY (role = 'owner') DESC, name`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/collaborators', requireTripAccess('owner'), validateBody(collaboratorCreateSchema), async (req, res, next) => {
  try {
    const { email, role = 'editor' } = req.body;
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: { code: 'not_found', message: 'No existe un usuario con ese email' } });
    }
    const result = await pool.query(
      'INSERT INTO trip_collaborators (trip_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [req.params.tripId, userResult.rows[0].id, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/trips/:tripId/collaborators/:userId', requireTripAccess('owner'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2', [
      req.params.tripId,
      req.params.userId,
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
