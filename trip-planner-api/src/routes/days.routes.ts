import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { dayCreateSchema, dayUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

// Lista los días de un trip, con sus actividades anidadas (ordenadas).
router.get('/trips/:tripId/days', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const daysResult = await pool.query(
      'SELECT * FROM itinerary_days WHERE trip_id = $1 ORDER BY day_number',
      [req.params.tripId]
    );
    const days = daysResult.rows;
    if (days.length === 0) return res.json([]);

    const activitiesResult = await pool.query(
      `SELECT * FROM activities WHERE itinerary_day_id = ANY($1) ORDER BY order_index`,
      [days.map((d) => d.id)]
    );

    const activitiesByDay: Record<string, any[]> = {};
    for (const activity of activitiesResult.rows) {
      (activitiesByDay[activity.itinerary_day_id] ??= []).push(activity);
    }

    res.json(days.map((day) => ({ ...day, activities: activitiesByDay[day.id] ?? [] })));
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/days', requireTripAccess('editor'), validateBody(dayCreateSchema), async (req, res, next) => {
  try {
    const { dayDate, dayNumber, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO itinerary_days (trip_id, day_date, day_number, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.tripId, dayDate, dayNumber, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Para PATCH/DELETE de un día puntual necesitamos saber a qué trip pertenece
// antes de poder chequear el acceso (la URL solo trae dayId).
async function loadTripIdForDay(dayId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM itinerary_days WHERE id = $1', [dayId]);
  return result.rows[0]?.trip_id ?? null;
}

router.patch('/days/:dayId', validateBody(dayUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForDay(req.params.dayId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Día no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const result = await pool.query('UPDATE itinerary_days SET notes = $1 WHERE id = $2 RETURNING *', [
        req.body.notes,
        req.params.dayId,
      ]);
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/days/:dayId', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForDay(req.params.dayId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Día no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM itinerary_days WHERE id = $1', [req.params.dayId]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
