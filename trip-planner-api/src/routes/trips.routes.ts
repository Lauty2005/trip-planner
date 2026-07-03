import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { tripCreateSchema, tripUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

// Trips donde el usuario es owner o colaborador.
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT t.* FROM trips t
       LEFT JOIN trip_collaborators tc ON tc.trip_id = t.id
       WHERE t.owner_id = $1 OR tc.user_id = $1
       ORDER BY t.start_date DESC`,
      [req.user!.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(tripCreateSchema), async (req, res, next) => {
  try {
    const { title, destination, destinationLat, destinationLng, startDate, endDate, currency = 'USD' } = req.body;
    const result = await pool.query(
      `INSERT INTO trips (owner_id, title, destination, destination_lat, destination_lng, start_date, end_date, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user!.userId, title, destination, destinationLat, destinationLng, startDate, endDate, currency]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:tripId', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.tripId]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:tripId', requireTripAccess('owner'), validateBody(tripUpdateSchema), async (req, res, next) => {
  try {
    const fields = ['title', 'destination', 'destinationLat', 'destinationLng', 'startDate', 'endDate', 'status', 'currency'];
    const columnMap: Record<string, string> = {
      title: 'title',
      destination: 'destination',
      destinationLat: 'destination_lat',
      destinationLng: 'destination_lng',
      startDate: 'start_date',
      endDate: 'end_date',
      status: 'status',
      currency: 'currency',
    };
    const updates = fields.filter((f) => req.body[f] !== undefined);
    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Nada para actualizar' } });
    }
    const setClause = updates.map((f, i) => `${columnMap[f]} = $${i + 2}`).join(', ');
    const values = updates.map((f) => req.body[f]);
    const result = await pool.query(
      `UPDATE trips SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.tripId, ...values]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:tripId', requireTripAccess('owner'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.tripId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
