import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { activityCreateSchema, activityUpdateSchema, activityReorderSchema } from '../schemas.js';
import { geocode } from '../services/geocoding.js';

const router = Router();
router.use(requireAuth);

async function loadTripIdForDay(dayId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM itinerary_days WHERE id = $1', [dayId]);
  return result.rows[0]?.trip_id ?? null;
}

async function loadTripIdForActivity(activityId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT d.trip_id FROM activities a JOIN itinerary_days d ON d.id = a.itinerary_day_id WHERE a.id = $1`,
    [activityId]
  );
  return result.rows[0]?.trip_id ?? null;
}

router.post('/days/:dayId/activities', validateBody(activityCreateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForDay(req.params.dayId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Día no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { title, description, category = 'other', locationName, startTime, endTime, orderIndex = 0, estimatedCost } = req.body;
      let { lat, lng } = req.body;
      // Si no vienen coordenadas explícitas pero sí un lugar en texto,
      // geocodificamos automáticamente (ver services/geocoding.ts) —
      // sumamos el destino del viaje a la búsqueda para desambiguar
      // ("Pumamarca" solo puede matchear cualquier cosa; "Pumamarca, Salta"
      // es mucho más preciso). Si Nominatim no encuentra nada o falla, la
      // actividad se guarda igual sin lat/lng (como antes).
      if ((lat == null || lng == null) && locationName) {
        const tripRow = await pool.query('SELECT destination FROM trips WHERE id = $1', [tripId]);
        const destination = tripRow.rows[0]?.destination;
        const geocoded = await geocode(destination ? `${locationName}, ${destination}` : locationName);
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
        }
      }
      const result = await pool.query(
        `INSERT INTO activities
           (itinerary_day_id, title, description, category, location_name, lat, lng, start_time, end_time, order_index, estimated_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.params.dayId, title, description, category, locationName, lat, lng, startTime, endTime, orderIndex, estimatedCost]
      );
      res.status(201).json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/activities/:activityId', validateBody(activityUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForActivity(req.params.activityId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Actividad no encontrada' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const columnMap: Record<string, string> = {
        title: 'title', description: 'description', category: 'category',
        locationName: 'location_name', lat: 'lat', lng: 'lng',
        startTime: 'start_time', endTime: 'end_time', orderIndex: 'order_index', estimatedCost: 'estimated_cost',
      };
      const updates = Object.keys(columnMap).filter((f) => req.body[f] !== undefined);
      if (updates.length === 0) return res.status(400).json({ error: { code: 'bad_request', message: 'Nada para actualizar' } });
      const setClause = updates.map((f, i) => `${columnMap[f]} = $${i + 2}`).join(', ');
      const values = updates.map((f) => req.body[f]);
      const result = await pool.query(
        `UPDATE activities SET ${setClause} WHERE id = $1 RETURNING *`,
        [req.params.activityId, ...values]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/activities/:activityId', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForActivity(req.params.activityId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Actividad no encontrada' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM activities WHERE id = $1', [req.params.activityId]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

// Reordena actividades dentro de un día (drag & drop en el frontend).
// Body esperado: { order: [activityId1, activityId2, ...] } en el orden final.
router.patch('/days/:dayId/activities/reorder', validateBody(activityReorderSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForDay(req.params.dayId);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Día no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { order } = req.body as { order: string[] };
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < order.length; i++) {
          await client.query('UPDATE activities SET order_index = $1 WHERE id = $2 AND itinerary_day_id = $3', [
            i,
            order[i],
            req.params.dayId,
          ]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
