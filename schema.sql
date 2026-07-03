-- =====================================================================
-- Plataforma de organización de viajes — Esquema PostgreSQL
-- Tablas: usuarios, viajes, itinerarios, presupuesto, hoteles, vuelos,
--         colaboradores y lugares guardados (para el mapa)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_uuid()

-- Categoria compartida de lugares (usada por activities y saved_places)
CREATE TYPE place_category AS ENUM ('sightseeing', 'food', 'transport', 'lodging', 'activity', 'other');

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- TRIPS (viaje principal)
-- ---------------------------------------------------------------------
CREATE TABLE trips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(150) NOT NULL,
    destination     VARCHAR(150) NOT NULL,
    -- centro del mapa para el viaje (ciudad/país)
    destination_lat DOUBLE PRECISION,
    destination_lng DOUBLE PRECISION,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    cover_image_url TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'confirmed', 'ongoing', 'completed', 'cancelled')),
    currency        CHAR(3) NOT NULL DEFAULT 'USD', -- ISO 4217
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    CONSTRAINT chk_trips_lat_range CHECK (destination_lat BETWEEN -90 AND 90),
    CONSTRAINT chk_trips_lng_range CHECK (destination_lng BETWEEN -180 AND 180),
    CONSTRAINT chk_trips_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_trips_owner ON trips(owner_id);

-- ---------------------------------------------------------------------
-- TRIP_COLLABORATORS (viajes compartidos — clave para versión mobile)
-- ---------------------------------------------------------------------
CREATE TABLE trip_collaborators (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Solo editor/viewer: la propiedad la define trips.owner_id, no este rol
    role        VARCHAR(20) NOT NULL DEFAULT 'editor'
                CHECK (role IN ('editor', 'viewer')),
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_id, user_id)
);

CREATE INDEX idx_trip_collaborators_user ON trip_collaborators(user_id);

-- ---------------------------------------------------------------------
-- ITINERARY_DAYS (un registro por día del viaje)
-- ---------------------------------------------------------------------
CREATE TABLE itinerary_days (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date    DATE NOT NULL,
    day_number  INTEGER NOT NULL, -- 1, 2, 3... (para ordenar sin recalcular fechas)
    notes       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_id, day_date)
);

CREATE INDEX idx_itinerary_days_trip ON itinerary_days(trip_id);

-- ---------------------------------------------------------------------
-- ACTIVITIES (actividades dentro de cada día — usa lat/lng para el mapa)
-- ---------------------------------------------------------------------
CREATE TABLE activities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_day_id  UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
    title             VARCHAR(150) NOT NULL,
    description       TEXT,
    category          place_category NOT NULL DEFAULT 'other',
    location_name     VARCHAR(200),
    lat               DOUBLE PRECISION,
    lng               DOUBLE PRECISION,
    start_time        TIME,
    end_time          TIME,
    order_index       INTEGER NOT NULL DEFAULT 0, -- orden dentro del día (drag & drop)
    estimated_cost    NUMERIC(10, 2) CHECK (estimated_cost >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_activities_lat_range CHECK (lat BETWEEN -90 AND 90),
    CONSTRAINT chk_activities_lng_range CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX idx_activities_day ON activities(itinerary_day_id);

-- ---------------------------------------------------------------------
-- BUDGET_CATEGORIES (categorías de presupuesto planificado por viaje)
-- ---------------------------------------------------------------------
CREATE TABLE budget_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name            VARCHAR(80) NOT NULL, -- ej: Hospedaje, Comida, Transporte, Actividades
    planned_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trip_id, name)
);

-- ---------------------------------------------------------------------
-- EXPENSES (gastos reales, asociados o no a una categoría)
-- ---------------------------------------------------------------------
CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    budget_category_id  UUID REFERENCES budget_categories(id) ON DELETE SET NULL,
    paid_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    description         VARCHAR(200) NOT NULL,
    amount              NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    expense_date        DATE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_expenses_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_expenses_trip ON expenses(trip_id);
CREATE INDEX idx_expenses_category ON expenses(budget_category_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_user_id);

-- ---------------------------------------------------------------------
-- HOTELS (hospedajes reservados o candidatos)
-- ---------------------------------------------------------------------
CREATE TABLE hotels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    address             TEXT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    check_in_date       DATE NOT NULL,
    check_out_date      DATE NOT NULL,
    price               NUMERIC(10, 2) CHECK (price >= 0),
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    confirmation_number VARCHAR(100),
    booking_source      VARCHAR(50), -- ej: 'amadeus', 'booking.com', 'manual'
    external_offer_id   VARCHAR(150), -- id devuelto por Amadeus, si aplica
    status              VARCHAR(20) NOT NULL DEFAULT 'candidate'
                        CHECK (status IN ('candidate', 'booked', 'cancelled')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (check_out_date >= check_in_date),
    CONSTRAINT chk_hotels_lat_range CHECK (lat BETWEEN -90 AND 90),
    CONSTRAINT chk_hotels_lng_range CHECK (lng BETWEEN -180 AND 180),
    CONSTRAINT chk_hotels_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_hotels_trip ON hotels(trip_id);

-- ---------------------------------------------------------------------
-- FLIGHTS (vuelos reservados o candidatos)
-- ---------------------------------------------------------------------
CREATE TABLE flights (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id               UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    airline               VARCHAR(100),
    flight_number         VARCHAR(20),
    departure_airport     VARCHAR(10), -- código IATA, ej: 'EZE'
    arrival_airport       VARCHAR(10),
    departure_datetime    TIMESTAMPTZ NOT NULL,
    arrival_datetime      TIMESTAMPTZ NOT NULL,
    -- Tramo del viaje: 'departure' (ida), 'return' (vuelta) o 'one_way'
    -- (vuelo suelto en medio del viaje, ej. un interno). Puramente
    -- informativo para agrupar/etiquetar en la UI — no cambia cómo se
    -- guardan fechas ni nada del resto del modelo.
    leg_type              VARCHAR(20) NOT NULL DEFAULT 'one_way'
                          CHECK (leg_type IN ('departure', 'return', 'one_way')),
    -- Escala: un solo stopover informativo (aeropuerto + tiempo de
    -- espera), no un segundo vuelo modelado aparte.
    has_layover           BOOLEAN NOT NULL DEFAULT false,
    layover_airport       VARCHAR(10),
    layover_duration_minutes INTEGER,
    price                 NUMERIC(10, 2) CHECK (price >= 0),
    currency              CHAR(3) NOT NULL DEFAULT 'USD',
    confirmation_number   VARCHAR(100),
    booking_source        VARCHAR(50),
    external_offer_id     VARCHAR(150), -- id devuelto por Amadeus, si aplica
    status                VARCHAR(20) NOT NULL DEFAULT 'candidate'
                          CHECK (status IN ('candidate', 'booked', 'cancelled')),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (arrival_datetime > departure_datetime),
    CONSTRAINT chk_flights_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_flights_trip ON flights(trip_id);

-- ---------------------------------------------------------------------
-- SAVED_PLACES (pines libres en el mapa: miradores, restaurantes, etc.
-- que todavía no están agendados en un día concreto)
-- ---------------------------------------------------------------------
CREATE TABLE saved_places (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    category    place_category NOT NULL DEFAULT 'other',
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_saved_places_lat_range CHECK (lat BETWEEN -90 AND 90),
    CONSTRAINT chk_saved_places_lng_range CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX idx_saved_places_trip ON saved_places(trip_id);

-- ---------------------------------------------------------------------
-- Trigger genérico para mantener updated_at al día
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_itinerary_days_updated_at
    BEFORE UPDATE ON itinerary_days
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_budget_categories_updated_at
    BEFORE UPDATE ON budget_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_hotels_updated_at
    BEFORE UPDATE ON hotels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_flights_updated_at
    BEFORE UPDATE ON flights
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saved_places_updated_at
    BEFORE UPDATE ON saved_places
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
