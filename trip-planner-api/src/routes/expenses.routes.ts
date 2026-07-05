import { Router } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { expenseCreateSchema, expenseUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

// Trae cada gasto con quién pagó (paid_by_name) y entre quiénes se divide
// (splits: [{userId, name}]) — el form de Gastos y la tab Balances lo
// necesitan para mostrar "pagado por X, dividido entre Y/Z" y calcular
// saldos sin tener que pegarle a /participants por cada gasto.
router.get('/trips/:tripId/expenses', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const { category, from, to } = req.query;
    const conditions = ['e.trip_id = $1'];
    const values: any[] = [req.params.tripId];

    if (category) {
      values.push(category);
      conditions.push(`e.budget_category_id = $${values.length}`);
    }
    if (from) {
      values.push(from);
      conditions.push(`e.expense_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`e.expense_date <= $${values.length}`);
    }

    const result = await pool.query(
      `SELECT
         e.*,
         payer.name AS paid_by_name,
         COALESCE(
           json_agg(json_build_object('userId', su.id, 'name', su.name)) FILTER (WHERE su.id IS NOT NULL),
           '[]'
         ) AS splits
       FROM expenses e
       LEFT JOIN users payer ON payer.id = e.paid_by_user_id
       LEFT JOIN expense_splits es ON es.expense_id = e.id
       LEFT JOIN users su ON su.id = es.user_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.id, payer.name
       ORDER BY e.expense_date DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Reemplaza todas las filas de expense_splits de un gasto por la lista
// nueva — usado tanto en el alta como en la edición (PATCH reemplaza
// entero en vez de hacer un diff, más simple y suficiente para partes
// iguales). No-op si userIds es undefined (PATCH que no toca la división).
async function replaceExpenseSplits(client: PoolClient, expenseId: string, userIds: string[] | undefined) {
  if (userIds === undefined) return;
  await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
  const uniqueIds = [...new Set(userIds)];
  for (const userId of uniqueIds) {
    await client.query('INSERT INTO expense_splits (expense_id, user_id) VALUES ($1, $2)', [expenseId, userId]);
  }
}

router.post('/trips/:tripId/expenses', requireTripAccess('editor'), validateBody(expenseCreateSchema), async (req, res, next) => {
  try {
    const {
      budgetCategoryId, description, amount, currency = 'USD', expenseDate, sourceHotelId, sourceFlightId,
      paidByUserId, splitUserIds,
    } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO expenses (trip_id, budget_category_id, paid_by_user_id, description, amount, currency, expense_date, source_hotel_id, source_flight_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          req.params.tripId, budgetCategoryId ?? null, paidByUserId ?? req.user!.userId, description, amount, currency, expenseDate,
          sourceHotelId ?? null, sourceFlightId ?? null,
        ]
      );
      const expense = result.rows[0];
      await replaceExpenseSplits(client, expense.id, splitUserIds);
      await client.query('COMMIT');
      res.status(201).json(expense);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
        paidByUserId: 'paid_by_user_id',
      };
      const updates = Object.keys(columnMap).filter((f) => f in req.body);
      const touchesSplits = 'splitUserIds' in req.body;
      if (updates.length === 0 && !touchesSplits) {
        return res.status(400).json({ error: { code: 'bad_request', message: 'Nada para actualizar' } });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let expense;
        if (updates.length > 0) {
          const setClause = updates.map((f, i) => `${columnMap[f]} = $${i + 2}`).join(', ');
          const values = updates.map((f) => req.body[f]);
          const result = await client.query(
            `UPDATE expenses SET ${setClause} WHERE id = $1 RETURNING *`,
            [req.params.id, ...values]
          );
          expense = result.rows[0];
        }
        await replaceExpenseSplits(client, req.params.id, req.body.splitUserIds);
        await client.query('COMMIT');
        if (!expense) {
          const result = await pool.query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
          expense = result.rows[0];
        }
        res.json(expense);
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
