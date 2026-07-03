import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

/**
 * Valida req.body contra un esquema zod. Si falla, responde 400 con el mismo
 * shape de error que usa el resto de la API ({ error: { code, message } }),
 * sumando `details` con el detalle por campo. Si pasa, reemplaza req.body por
 * los datos ya parseados/limpios para que los handlers reciban valores validados
 * (zod descarta las claves desconocidas).
 *
 * Se usa como middleware de ruta, después de requireAuth/requireTripAccess:
 *   router.post('/...', requireTripAccess('editor'), validateBody(schema), handler)
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Datos inválidos',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.') || '(body)',
            message: issue.message,
          })),
        },
      });
    }
    req.body = result.data;
    next();
  };
}
