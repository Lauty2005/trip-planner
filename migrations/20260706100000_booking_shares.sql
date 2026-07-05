-- UP
-- Reparto de un hotel/vuelo compartido entre varios viajeros, cada uno con
-- su propio monto y su propia fecha de pago (2026-07-06, a pedido de
-- Lautaro). Ver el comentario largo en schema.sql (bloque BOOKING_SHARES)
-- para el porqué de este diseño vs. reusar expense_splits.

CREATE TABLE IF NOT EXISTS booking_shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
    flight_id   UUID REFERENCES flights(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    expense_id  UUID REFERENCES expenses(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_booking_shares_one_parent CHECK ((hotel_id IS NOT NULL) <> (flight_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_shares_hotel_user ON booking_shares(hotel_id, user_id) WHERE hotel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_shares_flight_user ON booking_shares(flight_id, user_id) WHERE flight_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_shares_expense ON booking_shares(expense_id);

-- DOWN
-- DROP TABLE IF EXISTS booking_shares;
