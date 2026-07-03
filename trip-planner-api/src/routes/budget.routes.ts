import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTripAccess } from '../middleware/tripAccess.js';
import { validateBody } from '../middleware/validate.js';
import { budgetCategoryCreateSchema, budgetCategoryUpdateSchema } from '../schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/trips/:tripId/budget-categories', requireTripAccess('viewer'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM budget_categories WHERE trip_id = $1 ORDER BY name', [
      req.params.tripId,
    ]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trips/:tripId/budget-categories', requireTripAccess('editor'), validateBody(budgetCategoryCreateSchema), async (req, res, next) => {
  try {
    const { name, plannedAmount = 0 } = req.body;
    const result = await pool.query(
      'INSERT INTO budget_categories (trip_id, name, planned_amount) VALUES ($1, $2, $3) RETURNING *',
      [req.params.tripId, name, plannedAmount]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

async function loadTripIdForCategory(categoryId: string): Promise<string | null> {
  const result = await pool.query('SELECT trip_id FROM budget_categories WHERE id = $1', [categoryId]);
  return result.rows[0]?.trip_id ?? null;
}

router.patch('/budget-categories/:id', validateBody(budgetCategoryUpdateSchema), async (req, res, next) => {
  try {
    const tripId = await loadTripIdForCategory(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Categoría no encontrada' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      const { name, plannedAmount } = req.body;
      const result = await pool.query(
        'UPDATE budget_categories SET name = COALESCE($1, name), planned_amount = COALESCE($2, planned_amount) WHERE id = $3 RETURNING *',
        [name, plannedAmount, req.params.id]
      );
      res.json(result.rows[0]);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/budget-categories/:id', async (req, res, next) => {
  try {
    const tripId = await loadTripIdForCategory(req.params.id);
    if (!tripId) return res.status(404).json({ error: { code: 'not_found', message: 'Categoría no encontrada' } });
    (req.params as Record<string, string>).tripId = tripId;
    await requireTripAccess('editor')(req, res, async () => {
      await pool.query('DELETE FROM budget_categories WHERE id = $1', [req.params.id]);
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
