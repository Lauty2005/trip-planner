-- =====================================================================
-- Migracion: conecta hoteles/vuelos con Presupuesto.
-- A pedido de Lautaro: cargar un hotel/vuelo con precio y poder
-- asignarle una categoria de presupuesto, y despues "marcarlo como
-- pagado" desde la tab Gastos (que crea el gasto real, referenciando de
-- vuelta al hotel/vuelo de origen para no ofrecerlo dos veces). Aditiva y
-- reversible.
-- =====================================================================

-- UP
ALTER TABLE hotels  ADD COLUMN IF NOT EXISTS budget_category_id UUID REFERENCES budget_categories(id) ON DELETE SET NULL;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS budget_category_id UUID REFERENCES budget_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hotels_budget_category ON hotels(budget_category_id);
CREATE INDEX IF NOT EXISTS idx_flights_budget_category ON flights(budget_category_id);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_hotel_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_flight_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_source_hotel') THEN
        ALTER TABLE expenses ADD CONSTRAINT fk_expenses_source_hotel
            FOREIGN KEY (source_hotel_id) REFERENCES hotels(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_source_flight') THEN
        ALTER TABLE expenses ADD CONSTRAINT fk_expenses_source_flight
            FOREIGN KEY (source_flight_id) REFERENCES flights(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_single_source') THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expenses_single_source
            CHECK (source_hotel_id IS NULL OR source_flight_id IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_source_hotel ON expenses(source_hotel_id);
CREATE INDEX IF NOT EXISTS idx_expenses_source_flight ON expenses(source_flight_id);

-- DOWN
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_single_source;
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_source_flight;
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_source_hotel;
-- DROP INDEX IF EXISTS idx_expenses_source_flight;
-- DROP INDEX IF EXISTS idx_expenses_source_hotel;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS source_flight_id;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS source_hotel_id;
-- DROP INDEX IF EXISTS idx_flights_budget_category;
-- DROP INDEX IF EXISTS idx_hotels_budget_category;
-- ALTER TABLE flights DROP COLUMN IF EXISTS budget_category_id;
-- ALTER TABLE hotels DROP COLUMN IF EXISTS budget_category_id;
