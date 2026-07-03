import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../utils/jwt.js';

// Express no sabe de este campo por default; lo declaramos acá.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Falta el token' } });
  }
  try {
    const token = header.slice('Bearer '.length);
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Token inválido o vencido' } });
  }
}
