import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { expenseCreateSchema, expenseUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/trips/:tripId/expenses', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const { category, from, to } = req.query;
    const conditions = ['trip_id = $1'];
    const values: any[] = [req.params.tripId];

    if (category) {
      values.push(category);
      conditions.push(`budget_category_id = $${values.length}`);
    }
    if (from) {
      values.push(from);
      conditions.push(`expense_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`expense_date <= $${values.length}`);
    }

    const result = await pool.query(
      `SELECT * FROM expenses WHERE ${conditions.join(' AND ')} ORDER BY expense_date DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/expenses', requireTripAccess('editor'), validateBody(expenseCreateSchema), async (req, res, next) => {
  try {
    const { budgetCategoryId, description, amount, currency = 'USD', expenseDate, sourceHotelId, sourceFlightId } = req.body;
    const result = await pool.query(
      `INSERT INTO expenses (trip_id, budget_category_id, paid_by_user_id, description, amount, currency, expense_date, source_hotel_id, source_flight_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.params.tripId, budgetCategoryId ?? null, req.user!.userId, description, amount, currency, expenseDate,
        sourceHotelId ?? null, sourceFlightId ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Planificado vs gastado por categoría + total del trip.
router.get('/trips/:tripId/budget/summary', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         bc.id AS category_id,
         bc.name,
         bc.planned_amount,
         COALESCE(SUM(e.amount), 0) AS spent_amount
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.budget_category_id = bc.id
       WHERE bc.trip_id = $1
       GROUP BY bc.id, bc.name, bc.planned_amount
       ORDER BY bc.name`,
      [req.params.tripId]
    );

    const totals = await pool.query(
      `SELECT COALESCE(SUM(planned_amount), 0) AS total_planned
       FROM budget_categories WHERE trip_id = $1`,
      [req.params.tripId]
    );
    const spentTotal = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_spent FROM expenses WHERE trip_id = $1`,
      [req.params.tripId]
    );

    res.json({
      categories: result.rows,
      totalPlanned: Number(totals.rows[0].total_planned),
      totalSpent: Number(spentTotal.rows[0].total_spent),
    });
  } catch (err) {
    next(err);
  }
});

async function loadTripIdForExpense(expenseId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM expenses WHERE id = $1', [expenseId]);
  return result.rows[0]?.trip_id ?? null;
}

router.patch('/expenses/:id', validateBody(expenseUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForExpense(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Gasto no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      // Antes usaba COALESCE($n, columna) para los 4 campos, pero eso hace
      // imposible "limpiar" budget_category_id a NULL vía PATCH: pg
      // convierte undefined en NULL al bindear, y COALESCE(NULL, columna)
      // devuelve la columna sin tocar — mandar { budgetCategoryId: null }
      // desde el form de editar gasto (pasar a "Sin categoría") quedaba
      // sin efecto. Ahora el SET se arma dinámicamente solo con las claves
      // que realmente llegaron en el body (mismo patrón que
      // activities.routes.ts), así que `null` explícito sí limpia el campo
      // y una clave ausente sí lo deja intacto.
      const columnMap: Record<string, string> = {
        description: 'description',
        amount: 'amount',
        expenseDate: 'expense_date',
        budgetCategoryId: 'budget_category_id',
      };
      const updates = Object.keys(columnMap).filter((f) => f in req.body);
      if (updates.length === 0) return res.status(400).json({ error: { code: 'bad_request', message: 'Nada para actualizar' } });
      const setClause = updates.map((f, i) => `${columnMap[f]} = $${i + 2}`).join(', ');
      const values = updates.map((f) => req.body[f]);
      const result = await pool.query(
        `UPDATE expenses SET ${setClause} WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/expenses/:id', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForExpense(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Gasto no encontrado' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
