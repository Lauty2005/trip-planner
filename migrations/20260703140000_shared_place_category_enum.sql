-- =====================================================================
-- Migracion: tipo ENUM compartido place_category para la columna
-- category de activities y saved_places (elimina el CHECK duplicado).
-- PROPOSED: reescribe el tipo de columna (ACCESS EXCLUSIVE por tabla).
-- Reversible (ver DOWN).
-- =====================================================================

-- ---------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'place_category') THEN
        CREATE TYPE place_category AS ENUM ('sightseeing', 'food', 'transport', 'lodging', 'activity', 'other');
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='activities' AND column_name='category' AND udt_name <> 'place_category') THEN
        ALTER TABLE activities ALTER COLUMN category DROP DEFAULT;
        ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_category_check;
        ALTER TABLE activities ALTER COLUMN category TYPE place_category USING category::place_category;
        ALTER TABLE activities ALTER COLUMN category SET DEFAULT 'other';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='saved_places' AND column_name='category' AND udt_name <> 'place_category') THEN
        ALTER TABLE saved_places ALTER COLUMN category DROP DEFAULT;
        ALTER TABLE saved_places DROP CONSTRAINT IF EXISTS saved_places_category_check;
        ALTER TABLE saved_places ALTER COLUMN category TYPE place_category USING category::place_category;
        ALTER TABLE saved_places ALTER COLUMN category SET DEFAULT 'other';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------
-- ALTER TABLE saved_places ALTER COLUMN category DROP DEFAULT;
-- ALTER TABLE saved_places ALTER COLUMN category TYPE varchar(30) USING category::text;
-- ALTER TABLE saved_places ALTER COLUMN category SET DEFAULT 'other';
-- ALTER TABLE saved_places ADD CONSTRAINT saved_places_category_check CHECK (category IN ('sightseeing','food','transport','lodging','activity','other'));
-- ALTER TABLE activities ALTER COLUMN category DROP DEFAULT;
-- ALTER TABLE activities ALTER COLUMN category TYPE varchar(30) USING category::text;
-- ALTER TABLE activities ALTER COLUMN category SET DEFAULT 'other';
-- ALTER TABLE activities ADD CONSTRAINT activities_category_check CHECK (category IN ('sightseeing','food','transport','lodging','activity','other'));
-- DROP TYPE IF EXISTS place_category;
