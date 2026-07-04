-- =====================================================================
-- Migracion: N° de vuelo del tramo de la escala en flights.
-- A pedido de Lautaro: cuando un vuelo tiene escala, poder cargar tambien
-- el número de vuelo de ese segundo tramo (hoy solo se guardaba el
-- aeropuerto y el tiempo de espera). Aditiva y reversible.
-- =====================================================================

-- UP
ALTER TABLE flights ADD COLUMN IF NOT EXISTS layover_flight_number VARCHAR(20);

-- DOWN
-- ALTER TABLE flights DROP COLUMN IF EXISTS layover_flight_number;
