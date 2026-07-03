import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.routes.js';
import tripsRoutes from './routes/trips.routes.js';
import collaboratorsRoutes from './routes/collaborators.routes.js';
import daysRoutes from './routes/days.routes.js';
import activitiesRoutes from './routes/activities.routes.js';
import budgetRoutes from './routes/budget.routes.js';
import expensesRoutes from './routes/expenses.routes.js';
import hotelsRoutes from './routes/hotels.routes.js';
import flightsRoutes from './routes/flights.routes.js';
import placesRoutes from './routes/places.routes.js';
import mapRoutes from './routes/map.routes.js';
import locationsRoutes from './routes/locations.routes.js';

export const app = express();

app.use(cors());
app.use(express.json());

const v1 = express.Router();
v1.use('/auth', authRoutes);
v1.use('/trips', tripsRoutes);
v1.use('/', collaboratorsRoutes); // /trips/:tripId/collaborators
v1.use('/', daysRoutes);          // /trips/:tripId/days, /days/:dayId
v1.use('/', activitiesRoutes);    // /days/:dayId/activities, /activities/:id
v1.use('/', budgetRoutes);        // /trips/:tripId/budget-categories, /budget-categories/:id
v1.use('/', expensesRoutes);      // /trips/:tripId/expenses, /expenses/:id, /budget/summary
v1.use('/', hotelsRoutes);
v1.use('/', flightsRoutes);
v1.use('/', placesRoutes);
v1.use('/', mapRoutes);
v1.use('/', locationsRoutes);

app.use('/api/v1', v1);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Manejador de errores centralizado. Cada ruta hace next(err) en el catch.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Red de contención: cualquier ZodError que escape de un handler (p. ej. un
  // .parse() suelto) se reporta como 400 en vez de 500. La validación normal la
  // hace validateBody() antes de llegar acá.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Datos inválidos',
        details: err.issues.map((issue) => ({ field: issue.path.join('.') || '(body)', message: issue.message })),
      },
    });
  }
  console.error(err);
  const status = err.status ?? 500;
  res.status(status).json({
    error: { code: err.code ?? 'internal_error', message: err.message ?? 'Error interno' },
  });
});
