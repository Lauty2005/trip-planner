import { z } from 'zod';

// =====================================================================
// Esquemas de validación de request body (zod). Consumidos por
// validateBody() en las rutas. Cada esquema es un superconjunto exacto
// de los campos que lee su handler: zod descarta claves desconocidas,
// así que lo que no esté acá se ignora silenciosamente.
//
// Convención de nombres: los bodies usan camelCase (igual que hoy);
// los handlers ya mapean a snake_case contra las columnas.
// =====================================================================

// ---- Piezas compartidas -------------------------------------------------

// currency: 3 letras mayúsculas (mismo criterio que el CHECK de la DB).
const currency = z.string().regex(/^[A-Z]{3}$/, 'currency debe ser 3 letras mayúsculas (ISO 4217)');
const lat = z.number().min(-90, 'lat fuera de rango').max(90, 'lat fuera de rango');
const lng = z.number().min(-180, 'lng fuera de rango').max(180, 'lng fuera de rango');
const placeCategory = z.enum(['sightseeing', 'food', 'transport', 'lodging', 'activity', 'other']);
const uuid = z.string().uuid('id inválido');
// Fecha/datetime: aceptamos cualquier string que Date pueda parsear (el
// frontend manda ISO o 'YYYY-MM-DD'); el rango fino lo validan los CHECK de la DB.
const dateLike = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'fecha inválida');

// ---- Auth ---------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// ---- Trips --------------------------------------------------------------

export const tripCreateSchema = z.object({
  title: z.string().min(1).max(150),
  destination: z.string().min(1).max(150),
  destinationLat: lat.nullish(),
  destinationLng: lng.nullish(),
  startDate: dateLike,
  endDate: dateLike,
  currency: currency.optional(),
});

export const tripUpdateSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  destination: z.string().min(1).max(150).optional(),
  destinationLat: lat.nullish(),
  destinationLng: lng.nullish(),
  startDate: dateLike.optional(),
  endDate: dateLike.optional(),
  status: z.enum(['planning', 'confirmed', 'ongoing', 'completed', 'cancelled']).optional(),
  currency: currency.optional(),
});

// ---- Collaborators ------------------------------------------------------

export const collaboratorCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']).optional(),
});

// ---- Itinerary days -----------------------------------------------------

export const dayCreateSchema = z.object({
  dayDate: dateLike,
  dayNumber: z.number().int(),
  notes: z.string().nullish(),
});

export const dayUpdateSchema = z.object({
  notes: z.string().nullish(),
});

// ---- Activities ---------------------------------------------------------

const activityFields = {
  title: z.string().min(1).max(150),
  description: z.string().nullish(),
  category: placeCategory.optional(),
  locationName: z.string().max(200).nullish(),
  lat: lat.nullish(),
  lng: lng.nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  orderIndex: z.number().int().optional(),
  estimatedCost: z.number().min(0).nullish(),
};

export const activityCreateSchema = z.object(activityFields);
export const activityUpdateSchema = z.object({
  ...activityFields,
  title: z.string().min(1).max(150).optional(),
});
export const activityReorderSchema = z.object({
  order: z.array(uuid),
});

// ---- Budget categories --------------------------------------------------

export const budgetCategoryCreateSchema = z.object({
  name: z.string().min(1).max(80),
  plannedAmount: z.number().min(0).optional(),
});

export const budgetCategoryUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  plannedAmount: z.number().min(0).optional(),
});

// ---- Expenses -----------------------------------------------------------

export const expenseCreateSchema = z.object({
  budgetCategoryId: uuid.nullish(),
  description: z.string().min(1).max(200),
  amount: z.number().min(0),
  currency: currency.optional(),
  expenseDate: dateLike,
});

export const expenseUpdateSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  amount: z.number().min(0).optional(),
  expenseDate: dateLike.optional(),
  budgetCategoryId: uuid.nullish(),
});

// ---- Hotels -------------------------------------------------------------

export const hotelCreateSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().nullish(),
  lat: lat.nullish(),
  lng: lng.nullish(),
  checkInDate: dateLike,
  checkOutDate: dateLike,
  price: z.number().min(0).nullish(),
  currency: currency.optional(),
  bookingSource: z.string().max(50).nullish(),
  externalOfferId: z.string().max(150).nullish(),
  notes: z.string().nullish(),
});

export const hotelUpdateSchema = z.object({
  status: z.enum(['candidate', 'booked', 'cancelled']).optional(),
  price: z.number().min(0).nullish(),
  notes: z.string().nullish(),
});

// ---- Flights ------------------------------------------------------------

export const flightCreateSchema = z.object({
  airline: z.string().max(100).nullish(),
  flightNumber: z.string().max(20).nullish(),
  departureAirport: z.string().max(10).nullish(),
  arrivalAirport: z.string().max(10).nullish(),
  departureDatetime: dateLike,
  arrivalDatetime: dateLike,
  price: z.number().min(0).nullish(),
  currency: currency.optional(),
  bookingSource: z.string().max(50).nullish(),
  externalOfferId: z.string().max(150).nullish(),
  notes: z.string().nullish(),
  legType: z.enum(['departure', 'return', 'one_way']).optional(),
  hasLayover: z.boolean().optional(),
  layoverAirport: z.string().max(10).nullish(),
  layoverDurationMinutes: z.number().int().nullish(),
});

export const flightUpdateSchema = z.object({
  status: z.enum(['candidate', 'booked', 'cancelled']).optional(),
  price: z.number().min(0).nullish(),
  notes: z.string().nullish(),
});

// ---- Saved places -------------------------------------------------------

export const placeCreateSchema = z.object({
  name: z.string().min(1).max(200),
  category: placeCategory.optional(),
  lat, // saved_places.lat/lng son NOT NULL
  lng,
  notes: z.string().nullish(),
});

export const placeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: placeCategory.optional(),
  notes: z.string().nullish(),
});
