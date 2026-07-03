import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { placeCreateSchema, placeUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/trips/:tripId/places', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM saved_places WHERE trip_id = $1', [req.params.tripId]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/places', requireTripAccess('editor'), validateBody(placeCreateSchema), async (req, res, next) => {
  try {
    const { name, category = 'other', lat, lng, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO saved_places (trip_id, name, category, lat, lng, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.tripId, name, category, lat, lng, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

async function loadTripIdForPlace(placeId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM saved_places WHERE id = $1', [placeId]);
  return result.rows[0]?.trip_id ?? null;
}

router.patch('/places/:id', validateBody(placeUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForPlace(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Lugar no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { name, category, notes } = req.body;
      const result = await pool.query(
        `UPDATE saved_places SET name = COALESCE($1, name), category = COALESCE($2, category), notes = COALESCE($3, notes)
         WHERE id = $4 RETURNING *`,
        [name, category, notes, req.params.id]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/places/:id', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForPlace(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Lugar no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM saved_places WHERE id = $1', [req.params.id]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
