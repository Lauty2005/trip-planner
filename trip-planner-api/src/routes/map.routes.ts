import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';

const router = Router();
router.use(requireAuth);

// Agregado de todos los puntos con lat/lng de un trip (actividades,
// hoteles y lugares guardados), listo para pintar todos los pines
// del mapa en una sola llamada.
router.get('/trips/:tripId/map', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const tripId = req.params.tripId;

    const activities = await pool.query(
      `SELECT a.id, 'activity' AS type, a.title, a.lat, a.lng
       FROM activities a JOIN itinerary_days d ON d.id = a.itinerary_day_id
       WHERE d.trip_id = $1 AND a.lat IS NOT NULL AND a.lng IS NOT NULL`,
      [tripId]
    );

    const hotels = await pool.query(
      `SELECT id, 'hotel' AS type, name AS title, lat, lng
       FROM hotels WHERE trip_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL`,
      [tripId]
    );

    const places = await pool.query(
      `SELECT id, 'place' AS type, name AS title, lat, lng
       FROM saved_places WHERE trip_id = $1`,
      [tripId]
    );

    res.json([...activities.rows, ...hotels.rows, ...places.rows]);
  } catch (err) {
    next(err);
  }
});

export default router;
