import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { hotelCreateSchema, hotelUpdateSchema } from '../schemas.js';
import { searchHotelOffers } from '../services/amadeus.js';
import { geocode } from '../services/geocoding.js';

const router = Router();
router.use(requireAuth);

// Proxy a Amadeus — la API key nunca sale del backend.
router.get('/hotels/search', async (req, res, next) => {
  try {
    const { cityCode, checkInDate, checkOutDate } = req.query as Record<string, string>;
    const results = await searchHotelOffers({ cityCode, checkInDate, checkOutDate });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/trips/:tripId/hotels', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM hotels WHERE trip_id = $1 ORDER BY check_in_date', [
      req.params.tripId,
    ]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/hotels', requireTripAccess('editor'), validateBody(hotelCreateSchema), async (req, res, next) => {
  try {
    const { name, address, checkInDate, checkOutDate, price, currency = 'USD', bookingSource, externalOfferId, notes } = req.body;
    let { lat, lng } = req.body;
    // Mismo criterio que activities.routes.ts: sin coordenadas explícitas,
    // geocodificamos dirección (o nombre, si no hay dirección) + destino del
    // viaje para desambiguar. Ver services/geocoding.ts.
    if ((lat == null || lng == null) && (address || name)) {
      const tripRow = await pool.query('SELECT destination FROM trips WHERE id = $1', [req.params.tripId]);
      const destination = tripRow.rows[0]?.destination;
      const base = address || name;
      const geocoded = await geocode(destination ? `${base}, ${destination}` : base);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    }
    const result = await pool.query(
      `INSERT INTO hotels (trip_id, name, address, lat, lng, check_in_date, check_out_date, price, currency, booking_source, external_offer_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.tripId, name, address, lat, lng, checkInDate, checkOutDate, price, currency, bookingSource, externalOfferId, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

async function loadTripIdForHotel(hotelId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM hotels WHERE id = $1', [hotelId]);
  return result.rows[0]?.trip_id ?? null;
}

router.patch('/hotels/:id', validateBody(hotelUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForHotel(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Hotel no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { status, price, notes } = req.body;
      const result = await pool.query(
        `UPDATE hotels SET status = COALESCE($1, status), price = COALESCE($2, price), notes = COALESCE($3, notes)
         WHERE id = $4 RETURNING *`,
        [status, price, notes, req.params.id]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/hotels/:id', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForHotel(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Hotel no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM hotels WHERE id = $1', [req.params.id]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
