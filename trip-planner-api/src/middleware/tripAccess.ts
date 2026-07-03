import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';

export type TripRole = 'owner' | 'editor' | 'viewer';

declare global {
  namespace Express {
    interface Request {
      tripRole?: TripRole;
    }
  }
}

/**
 * Verifica que el usuario autenticado sea owner o colaborador del trip
 * de la URL (req.params.tripId). Guarda el rol efectivo en req.tripRole
 * para que las rutas de escritura puedan exigir 'editor'/'owner'.
 */
export function requireTripAccess(minRole: TripRole = 'viewer') {
  const roleRank: Record<TripRole, number> = { viewer: 0, editor: 1, owner: 2 };

  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      const tripId = req.params.tripId;
      const userId = req.user!.userId;

      const tripResult = await pool.query('SELECT owner_id FROM trips WHERE id = $1', [tripId]);
      if (tripResult.rowCount === 0) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Trip no encontrado' } });
      }

      let role: TripRole;
      if (tripResult.rows[0].owner_id === userId) {
        role = 'owner';
      } else {
        const collabResult = await pool.query(
          'SELECT role FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2',
          [tripId, userId]
        );
        if (collabResult.rowCount === 0) {
          return res.status(403).json({ error: { code: 'forbidden', message: 'No tenés acceso a este trip' } });
        }
        role = collabResult.rows[0].role as TripRole;
      }

      if (roleRank[role] < roleRank[minRole]) {
        return res.status(403).json({ error: { code: 'forbidden', message: `Se requiere rol ${minRole}` } });
      }

      req.tripRole = role;
      // `return` importa: cuando next() es en realidad un callback async
      // (ver el patrón usado en days/activities/budget/... routes para
      // recursos anidados), esto encadena su promesa a la nuestra para
      // que los errores lleguen al try/catch del caller en vez de quedar
      // como una promesa rechazada sin manejar.
      return next();
    } catch (err) {
      next(err);
    }
  };
}
