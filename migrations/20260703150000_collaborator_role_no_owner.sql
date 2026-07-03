-- =====================================================================
-- Migracion: quitar 'owner' del CHECK de trip_collaborators.role.
-- La propiedad del viaje la define trips.owner_id (unica autoridad);
-- los colaboradores solo pueden ser editor o viewer.
-- Reversible (ver DOWN). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------
ALTER TABLE trip_collaborators DROP CONSTRAINT IF EXISTS trip_collaborators_role_check;
ALTER TABLE trip_collaborators ADD CONSTRAINT trip_collaborators_role_check
    CHECK (role IN ('editor', 'viewer'));

-- ---------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------
-- ALTER TABLE trip_collaborators DROP CONSTRAINT IF EXISTS trip_collaborators_role_check;
-- ALTER TABLE trip_collaborators ADD CONSTRAINT trip_collaborators_role_check
--     CHECK (role IN ('owner', 'editor', 'viewer'));
