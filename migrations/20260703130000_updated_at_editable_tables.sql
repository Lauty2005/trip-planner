-- =====================================================================
-- Migración: columna updated_at + trigger en las 7 tablas editables
-- que aún no la tenían (reutiliza set_updated_at()).
-- Aditiva y reversible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------
ALTER TABLE itinerary_days    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE activities        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE expenses          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE hotels            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE flights           ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE saved_places      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- CREATE TRIGGER no admite IF NOT EXISTS → DROP + CREATE lo hace idempotente
DROP TRIGGER IF EXISTS trg_itinerary_days_updated_at ON itinerary_days;
CREATE TRIGGER trg_itinerary_days_updated_at BEFORE UPDATE ON itinerary_days
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_activities_updated_at ON activities;
CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_budget_categories_updated_at ON budget_categories;
CREATE TRIGGER trg_budget_categories_updated_at BEFORE UPDATE ON budget_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_hotels_updated_at ON hotels;
CREATE TRIGGER trg_hotels_updated_at BEFORE UPDATE ON hotels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_flights_updated_at ON flights;
CREATE TRIGGER trg_flights_updated_at BEFORE UPDATE ON flights
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_saved_places_updated_at ON saved_places;
CREATE TRIGGER trg_saved_places_updated_at BEFORE UPDATE ON saved_places
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_saved_places_updated_at ON saved_places;
-- DROP TRIGGER IF EXISTS trg_flights_updated_at ON flights;
-- DROP TRIGGER IF EXISTS trg_hotels_updated_at ON hotels;
-- DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
-- DROP TRIGGER IF EXISTS trg_budget_categories_updated_at ON budget_categories;
-- DROP TRIGGER IF EXISTS trg_activities_updated_at ON activities;
-- DROP TRIGGER IF EXISTS trg_itinerary_days_updated_at ON itinerary_days;
-- ALTER TABLE saved_places      DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE flights           DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE hotels            DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE expenses          DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE budget_categories DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE activities        DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE itinerary_days    DROP COLUMN IF EXISTS updated_at;
