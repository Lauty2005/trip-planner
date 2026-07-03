-- =====================================================================
-- Migracion: CHECK de rango para lat/lng y de formato para currency.
-- lat en [-90,90], lng en [-180,180]; currency = 3 letras mayusculas
-- (validacion de FORMATO, no de pertenencia a ISO-4217).
-- Aditiva y reversible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_trips_lat_range') THEN
        ALTER TABLE trips ADD CONSTRAINT chk_trips_lat_range CHECK (destination_lat BETWEEN -90 AND 90) NOT VALID;
        ALTER TABLE trips VALIDATE CONSTRAINT chk_trips_lat_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_trips_lng_range') THEN
        ALTER TABLE trips ADD CONSTRAINT chk_trips_lng_range CHECK (destination_lng BETWEEN -180 AND 180) NOT VALID;
        ALTER TABLE trips VALIDATE CONSTRAINT chk_trips_lng_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_activities_lat_range') THEN
        ALTER TABLE activities ADD CONSTRAINT chk_activities_lat_range CHECK (lat BETWEEN -90 AND 90) NOT VALID;
        ALTER TABLE activities VALIDATE CONSTRAINT chk_activities_lat_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_activities_lng_range') THEN
        ALTER TABLE activities ADD CONSTRAINT chk_activities_lng_range CHECK (lng BETWEEN -180 AND 180) NOT VALID;
        ALTER TABLE activities VALIDATE CONSTRAINT chk_activities_lng_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_hotels_lat_range') THEN
        ALTER TABLE hotels ADD CONSTRAINT chk_hotels_lat_range CHECK (lat BETWEEN -90 AND 90) NOT VALID;
        ALTER TABLE hotels VALIDATE CONSTRAINT chk_hotels_lat_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_hotels_lng_range') THEN
        ALTER TABLE hotels ADD CONSTRAINT chk_hotels_lng_range CHECK (lng BETWEEN -180 AND 180) NOT VALID;
        ALTER TABLE hotels VALIDATE CONSTRAINT chk_hotels_lng_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_saved_places_lat_range') THEN
        ALTER TABLE saved_places ADD CONSTRAINT chk_saved_places_lat_range CHECK (lat BETWEEN -90 AND 90) NOT VALID;
        ALTER TABLE saved_places VALIDATE CONSTRAINT chk_saved_places_lat_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_saved_places_lng_range') THEN
        ALTER TABLE saved_places ADD CONSTRAINT chk_saved_places_lng_range CHECK (lng BETWEEN -180 AND 180) NOT VALID;
        ALTER TABLE saved_places VALIDATE CONSTRAINT chk_saved_places_lng_range;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_trips_currency_format') THEN
        ALTER TABLE trips ADD CONSTRAINT chk_trips_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
        ALTER TABLE trips VALIDATE CONSTRAINT chk_trips_currency_format;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_expenses_currency_format') THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expenses_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
        ALTER TABLE expenses VALIDATE CONSTRAINT chk_expenses_currency_format;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_hotels_currency_format') THEN
        ALTER TABLE hotels ADD CONSTRAINT chk_hotels_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
        ALTER TABLE hotels VALIDATE CONSTRAINT chk_hotels_currency_format;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_flights_currency_format') THEN
        ALTER TABLE flights ADD CONSTRAINT chk_flights_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
        ALTER TABLE flights VALIDATE CONSTRAINT chk_flights_currency_format;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------
-- ALTER TABLE flights      DROP CONSTRAINT IF EXISTS chk_flights_currency_format;
-- ALTER TABLE hotels       DROP CONSTRAINT IF EXISTS chk_hotels_currency_format;
-- ALTER TABLE expenses     DROP CONSTRAINT IF EXISTS chk_expenses_currency_format;
-- ALTER TABLE trips        DROP CONSTRAINT IF EXISTS chk_trips_currency_format;
-- ALTER TABLE saved_places DROP CONSTRAINT IF EXISTS chk_saved_places_lng_range;
-- ALTER TABLE saved_places DROP CONSTRAINT IF EXISTS chk_saved_places_lat_range;
-- ALTER TABLE hotels       DROP CONSTRAINT IF EXISTS chk_hotels_lng_range;
-- ALTER TABLE hotels       DROP CONSTRAINT IF EXISTS chk_hotels_lat_range;
-- ALTER TABLE activities   DROP CONSTRAINT IF EXISTS chk_activities_lng_range;
-- ALTER TABLE activities   DROP CONSTRAINT IF EXISTS chk_activities_lat_range;
-- ALTER TABLE trips        DROP CONSTRAINT IF EXISTS chk_trips_lng_range;
-- ALTER TABLE trips        DROP CONSTRAINT IF EXISTS chk_trips_lat_range;
