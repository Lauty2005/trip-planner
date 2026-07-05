import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { bookingSharePaySchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

// Marca la parte de UN viajero como pagada (botón "Marcar pagado" de su
// fila en Gastos → Pendientes de pago) — crea el gasto real, con
// paid_by_user_id = esa persona y SIN dividir entre nadie más: cada quien
// paga lo suyo, así que no genera una deuda cruzada (ver splitBalances.ts
// en el frontend, que solo mira expenses con splits cargados). Lo vincula
// de vuelta al reparto (booking_shares.expense_id) para que no se vuelva a
// mostrar como pendiente ni se pueda tocar desde PUT .../shares.
router.post('/booking-shares/:id/pay', validateBody(bookingSharePaySchema), async (req, res, next) => {
  try {
    const shareRow = await pool.query(
      `SELECT bs.id, bs.user_id, bs.amount, bs.expense_id, bs.hotel_id, bs.flight_id,
              COALESCE(h.trip_id, f.trip_id) AS trip_id,
              COALESCE(h.currency, f.currency) AS currency,
              COALESCE(h.budget_category_id, f.budget_category_id) AS budget_category_id,
              h.name AS hotel_name, f.flight_number, f.departure_airport, f.arrival_airport
       FROM booking_shares bs
       LEFT JOIN hotels h ON h.id = bs.hotel_id
       LEFT JOIN flights f ON f.id = bs.flight_id
       WHERE bs.id = $1`,
      [req.params.id]
    );
    const share = shareRow.rows[0];
    if (!share) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Reparto no encontrado' } });
    }
    if (share.expense_id) {
      return res.status(409).json({ error: { code: 'already_paid', message: 'Esta parte ya está marcada como pagada' } });
    }
    (req.params as Record<string, string>).tripId = share.trip_id;
    await requireTripAccess('editor')(req, res, async () => {
      const description = share.hotel_id
        ? share.hotel_name
        : share.flight_number
          ? `Vuelo ${share.flight_number}`
          : `${share.departure_airport ?? '???'} → ${share.arrival_airport ?? '???'}`;
      const { paidDate } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const expenseResult = await client.query(
          `INSERT INTO expenses (trip_id, budget_category_id, paid_by_user_id, description, amount, currency, expense_date, source_hotel_id, source_flight_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            share.trip_id,
            share.budget_category_id,
            share.user_id,
            description,
            share.amount,
            share.currency,
            paidDate ?? new Date().toISOString().slice(0, 10),
            share.hotel_id,
            share.flight_id,
          ]
        );
        const expense = expenseResult.rows[0];
        await client.query('UPDATE booking_shares SET expense_id = $1 WHERE id = $2', [expense.id, share.id]);
        await client.query('COMMIT');
        res.status(201).json({ shareId: share.id, expense });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
