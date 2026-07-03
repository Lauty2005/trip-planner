-- =====================================================================
-- Migracion: indice de soporte para el FK expenses.paid_by_user_id.
-- Evita el seq scan en ON DELETE SET NULL (borrado de usuario) y en
-- consultas por pagador. Aditiva y reversible.
-- =====================================================================

-- UP
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by
    ON expenses(paid_by_user_id);

-- DOWN
-- DROP INDEX IF EXISTS idx_expenses_paid_by;
