-- =====================================================================
-- Migracion: division de gastos entre participantes del viaje.
-- A pedido de Lautaro: viajes de mas de una persona necesitan repartir
-- cada gasto entre quienes correspondan (partes iguales, primera
-- version). expense_splits guarda una fila por persona incluida en la
-- division de un gasto puntual; sin filas = gasto no dividido (no entra
-- en el calculo de balances). Aditiva y reversible.
-- =====================================================================

-- UP
CREATE TABLE IF NOT EXISTS expense_splits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id);

-- DOWN
-- DROP TABLE IF EXISTS expense_splits;
