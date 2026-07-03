import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchLocations } from '../services/amadeus.js';

const router = Router();
router.use(requireAuth);

// Autocompletado de ciudad/aeropuerto para los forms de búsqueda de
// hoteles/vuelos (mismo patrón que hotels.routes.ts/flights.routes.ts: la
// API key de Amadeus nunca sale del backend). Con menos de 2 caracteres no
// vale la pena pegarle a Amadeus, devolvemos vacío directamente.
router.get('/locations/search', async (req, res, next) => {
  try {
    const { keyword } = req.query as Record<string, string>;
    if (!keyword || keyword.trim().length < 2) {
      return res.json({ data: [] });
    }
    const results = await searchLocations({ keyword });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

export default router;
