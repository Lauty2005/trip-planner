import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { flightCreateSchema, flightUpdateSchema } from '../schemas.js';
import { searchFlightOffers } from '../services/amadeus.js';
import { estimateArrival } from '../services/flightEstimate.js';

const router = Router();
router.use(requireAuth);

router.get('/flights/search', async (req, res, next) => {
  try {
    const { originLocationCode, destinationLocationCode, departureDate, adults = '1' } = req.query as Record<string, string>;
    const results = await searchFlightOffers({ originLocationCode, destinationLocationCode, departureDate, adults });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// Estimación aproximada de llegada — form de Reservas (Ida/Vuelta/Interno).
// layoverMinutes es opcional: si el vuelo tiene escala, se suma a la
// duración estimada (ver services/flightEstimate.ts). Ver ese archivo para
// el disclaimer completo: NO es el horario real del vuelo, es geocoding +
// distancia.
router.get('/flights/estimate-arrival', async (req, res, next) => {
  try {
    const { origin, destination, departureDatetime, layoverMinutes } = req.query as Record<string, string>;
    if (!origin || !destination || !departureDatetime) {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'Faltan origin, destination o departureDatetime' },
      });
    }
    const estimate = await estimateArrival(origin, destination, departureDatetime, Number(layoverMinutes) || 0);
    if (!estimate) {
      return res.status(422).json({
        error: { code: 'estimate_failed', message: 'No se pudo estimar la llegada (no se ubicó alguno de los aeropuertos)' },
      });
    }
    res.json(estimate);
  } catch (err) {
    next(err);
  }
});

router.get('/trips/:tripId/flights', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM flights WHERE trip_id = $1 ORDER BY departure_datetime', [
      req.params.tripId,
    ]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/flights', requireTripAccess('editor'), validateBody(flightCreateSchema), async (req, res, next) => {
  try {
    const {
      airline, flightNumber, departureAirport, arrivalAirport,
      departureDatetime, arrivalDatetime, price, currency = 'USD', bookingSource, externalOfferId, notes,
      legType = 'one_way', hasLayover = false, layoverAirport, layoverDurationMinutes, layoverFlightNumber,
      budgetCategoryId,
    } = req.body;
    const result = await pool.query(
      `INSERT INTO flights (
         trip_id, airline, flight_number, departure_airport, arrival_airport,
         departure_datetime, arrival_datetime, price, currency, booking_source, external_offer_id, notes,
         leg_type, has_layover, layover_airport, layover_duration_minutes, layover_flight_number, budget_category_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.params.tripId, airline, flightNumber, departureAirport, arrivalAirport,
        departureDatetime, arrivalDatetime, price, currency, bookingSource, externalOfferId, notes,
        legType, hasLayover, layoverAirport, layoverDurationMinutes, layoverFlightNumber, budgetCategoryId,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

async function loadTripIdForFlight(flightId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM flights WHERE id = $1', [flightId]);
  return result.rows[0]?.trip_id ?? null;
}

// Ampliado (2026-07-04) para soportar "Editar vuelo" completo desde el
// dossier — antes solo tocaba status/price/notes. COALESCE por columna
// deja mandar un PATCH parcial (solo lo que cambió en el form) sin pisar
// el resto con NULL.
router.patch('/flights/:id', validateBody(flightUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForFlight(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Vuelo no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const {
        airline, flightNumber, departureAirport, arrivalAirport,
        departureDatetime, arrivalDatetime, price, currency, notes, status,
        legType, hasLayover, layoverAirport, layoverDurationMinutes, layoverFlightNumber,
        budgetCategoryId,
      } = req.body;
      const result = await pool.query(
        `UPDATE flights SET
           airline = COALESCE($1, airline),
           flight_number = COALESCE($2, flight_number),
           departure_airport = COALESCE($3, departure_airport),
           arrival_airport = COALESCE($4, arrival_airport),
           departure_datetime = COALESCE($5, departure_datetime),
           arrival_datetime = COALESCE($6, arrival_datetime),
           price = COALESCE($7, price),
           currency = COALESCE($8, currency),
           notes = COALESCE($9, notes),
           status = COALESCE($10, status),
           leg_type = COALESCE($11, leg_type),
           has_layover = COALESCE($12, has_layover),
           layover_airport = COALESCE($13, layover_airport),
           layover_duration_minutes = COALESCE($14, layover_duration_minutes),
           layover_flight_number = COALESCE($15, layover_flight_number),
           budget_category_id = COALESCE($16, budget_category_id)
         WHERE id = $17 RETURNING *`,
        [
          airline, flightNumber, departureAirport, arrivalAirport,
          departureDatetime, arrivalDatetime, price, currency, notes, status,
          legType, hasLayover, layoverAirport, layoverDurationMinutes, layoverFlightNumber,
          budgetCategoryId, req.params.id,
        ]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/flights/:id', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForFlight(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Vuelo no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM flights WHERE id = $1', [req.params.id]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
