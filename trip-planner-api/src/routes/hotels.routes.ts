import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { hotelCreateSchema, hotelUpdateSchema, bookingSharesReplaceSchema } from '../schemas.js';
import { searchHotelOffers } from '../services/amadeus.js';
import { geocode } from '../services/geocoding.js';
import { replaceBookingShares } from '../services/bookingShares.js';

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

// Trae cada hotel con su reparto entre viajeros, si tiene uno armado (tab
// Hoteles, sección "Reparto") — shares: [{id, userId, name, amount, paid,
// paidAt}]. `paid` es true una vez que ESA persona marcó su parte como
// pagada (booking_shares.expense_id no nulo, ver POST /booking-shares/:id/pay).
router.get('/trips/:tripId/hotels', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         h.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id', bs.id, 'userId', bs.user_id, 'name', su.name, 'amount', bs.amount,
               'paid', bs.expense_id IS NOT NULL, 'paidAt', pe.expense_date
             ) ORDER BY su.name
           ) FILTER (WHERE bs.id IS NOT NULL),
           '[]'
         ) AS shares
       FROM hotels h
       LEFT JOIN booking_shares bs ON bs.hotel_id = h.id
       LEFT JOIN users su ON su.id = bs.user_id
       LEFT JOIN expenses pe ON pe.id = bs.expense_id
       WHERE h.trip_id = $1
       GROUP BY h.id
       ORDER BY h.check_in_date`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/hotels', requireTripAccess('editor'), validateBody(hotelCreateSchema), async (req, res, next) => {
  try {
    const {
      name, address, checkInDate, checkOutDate, price, currency = 'USD',
      bookingSource, externalOfferId, notes, budgetCategoryId,
    } = req.body;
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
      `INSERT INTO hotels (trip_id, name, address, lat, lng, check_in_date, check_out_date, price, currency, booking_source, external_offer_id, notes, budget_category_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.tripId, name, address, lat, lng, checkInDate, checkOutDate, price, currency, bookingSource, externalOfferId, notes, budgetCategoryId]
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

// Ampliado (2026-07-06) para soportar "Editar hotel" completo desde el
// dossier — antes solo tocaba status/price/notes/budgetCategoryId.
// COALESCE por columna deja mandar un PATCH parcial (solo lo que cambió en
// el form) sin pisar el resto con NULL.
router.patch('/hotels/:id', validateBody(hotelUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForHotel(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Hotel no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { name, address, checkInDate, checkOutDate, currency, status, price, notes, budgetCategoryId } = req.body;
      let { lat, lng } = req.body;
      // Si se edita la dirección (o el nombre, sin dirección) sin mandar
      // coordenadas explícitas, re-geocodificamos — mismo criterio que el
      // alta (POST /trips/:tripId/hotels) — así el pin del mapa no queda
      // desactualizado después de corregir la dirección.
      if (lat == null && lng == null && (address !== undefined || name !== undefined)) {
        const tripRow = await pool.query('SELECT destination FROM trips WHERE id = $1', [tripId]);
        const destination = tripRow.rows[0]?.destination;
        const base = address || name;
        if (base) {
          const geocoded = await geocode(destination ? `${base}, ${destination}` : base);
          if (geocoded) {
            lat = geocoded.lat;
            lng = geocoded.lng;
          }
        }
      }
      const result = await pool.query(
        `UPDATE hotels SET
           name = COALESCE($1, name),
           address = COALESCE($2, address),
           lat = COALESCE($3, lat),
           lng = COALESCE($4, lng),
           check_in_date = COALESCE($5, check_in_date),
           check_out_date = COALESCE($6, check_out_date),
           currency = COALESCE($7, currency),
           status = COALESCE($8, status),
           price = COALESCE($9, price),
           notes = COALESCE($10, notes),
           budget_category_id = COALESCE($11, budget_category_id)
         WHERE id = $12 RETURNING *`,
        [name, address, lat, lng, checkInDate, checkOutDate, currency, status, price, notes, budgetCategoryId, req.params.id]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

// Arma/reemplaza el reparto de este hotel entre viajeros (sección "Reparto"
// en la tarjeta del hotel, tab Hoteles) — reemplazo entero de la lista,
// nunca toca una parte ya pagada (ver replaceBookingShares). Devuelve el
// reparto actualizado con nombre + estado de pago de cada quien.
router.put('/hotels/:id/shares', validateBody(bookingSharesReplaceSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForHotel(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Hotel no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await replaceBookingShares(client, { hotelId: req.params.id }, req.body.shares);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      const result = await pool.query(
        `SELECT bs.id, bs.user_id AS "userId", su.name, bs.amount,
                bs.expense_id IS NOT NULL AS paid, pe.expense_date AS "paidAt"
         FROM booking_shares bs
         JOIN users su ON su.id = bs.user_id
         LEFT JOIN expenses pe ON pe.id = bs.expense_id
         WHERE bs.hotel_id = $1
         ORDER BY su.name`,
        [req.params.id]
      );
      res.json(result.rows);
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
