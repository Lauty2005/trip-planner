-- =====================================================================
-- Migración: índice faltante en trip_collaborators(user_id)
--            + CHECK de no-negatividad en columnas monetarias
-- Aditiva y reversible. Segura para bases con datos existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user
    ON trip_collaborators(user_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_budget_categories_planned_nonneg') THEN
        ALTER TABLE budget_categories ADD CONSTRAINT chk_budget_categories_planned_nonneg
            CHECK (planned_amount >= 0) NOT VALID;
        ALTER TABLE budget_categories VALIDATE CONSTRAINT chk_budget_categories_planned_nonneg;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_amount_nonneg') THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_nonneg
            CHECK (amount >= 0) NOT VALID;
        ALTER TABLE expenses VALIDATE CONSTRAINT chk_expenses_amount_nonneg;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_hotels_price_nonneg') THEN
        ALTER TABLE hotels ADD CONSTRAINT chk_hotels_price_nonneg
            CHECK (price >= 0) NOT VALID;
        ALTER TABLE hotels VALIDATE CONSTRAINT chk_hotels_price_nonneg;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_flights_price_nonneg') THEN
        ALTER TABLE flights ADD CONSTRAINT chk_flights_price_nonneg
            CHECK (price >= 0) NOT VALID;
        ALTER TABLE flights VALIDATE CONSTRAINT chk_flights_price_nonneg;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_activities_estcost_nonneg') THEN
        ALTER TABLE activities ADD CONSTRAINT chk_activities_estcost_nonneg
            CHECK (estimated_cost >= 0) NOT VALID;
        ALTER TABLE activities VALIDATE CONSTRAINT chk_activities_estcost_nonneg;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------
-- ALTER TABLE activities        DROP CONSTRAINT IF EXISTS chk_activities_estcost_nonneg;
-- ALTER TABLE flights           DROP CONSTRAINT IF EXISTS chk_flights_price_nonneg;
-- ALTER TABLE hotels            DROP CONSTRAINT IF EXISTS chk_hotels_price_nonneg;
-- ALTER TABLE expenses          DROP CONSTRAINT IF EXISTS chk_expenses_amount_nonneg;
-- ALTER TABLE budget_categories DROP CONSTRAINT IF EXISTS chk_budget_categories_planned_nonneg;
-- DROP INDEX IF EXISTS idx_trip_collaborators_user;
