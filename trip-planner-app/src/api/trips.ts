import { apiClient } from './client';
import type { Trip, ItineraryDay, Activity, ActivityCategory, MapPin, BookingStatus } from '@/types';

// El backend devuelve los trips como filas crudas de la base (snake_case, vía
// SELECT *), pero el resto de la app consume Trip en camelCase. Mapeamos acá,
// en un solo lugar, para que la lista, el dashboard y el detalle vean fechas y
// demás campos correctamente (antes trip.startDate quedaba undefined).
// Las columnas DATE pueden llegar como 'YYYY-MM-DD' o, si el driver de pg las
// serializa como timestamp, como ISO completo ('YYYY-MM-DDTHH:mm:ssZ'). Nos
// quedamos siempre con la parte de fecha para mostrarla prolija.
function toDateOnly(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 10) : '';
}

// Igual que mapTrip: días y actividades también vienen crudos de la base
// (day_date, day_number, location_name, start_time, estimated_cost, etc.).
// getTripDays los devolvía tal cual, así que day.dayNumber/day.dayDate y
// activity.locationName/startTime/estimatedCost quedaban undefined en
// pantalla — no se notaba porque hasta ahora no había forma de cargar un
// día (no existía ningún form), así que el timeline siempre estaba vacío.
function mapActivity(r: any): Activity {
  return {
    id: r.id,
    itineraryDayId: r.itinerary_day_id,
    title: r.title,
    description: r.description ?? undefined,
    category: r.category,
    locationName: r.location_name ?? undefined,
    lat: r.lat != null ? Number(r.lat) : undefined,
    lng: r.lng != null ? Number(r.lng) : undefined,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    orderIndex: r.order_index,
    estimatedCost: r.estimated_cost != null ? Number(r.estimated_cost) : undefined,
  };
}

function mapDay(r: any): ItineraryDay {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayDate: toDateOnly(r.day_date),
    dayNumber: r.day_number,
    notes: r.notes ?? undefined,
    activities: Array.isArray(r.activities) ? r.activities.map(mapActivity) : undefined,
  };
}

function mapTrip(r: any): Trip {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    destination: r.destination,
    destinationLat: r.destination_lat ?? undefined,
    destinationLng: r.destination_lng ?? undefined,
    startDate: toDateOnly(r.start_date),
    endDate: toDateOnly(r.end_date),
    coverImageUrl: r.cover_image_url ?? undefined,
    status: r.status,
    currency: r.currency,
  };
}

// Hoteles/vuelos guardados de un viaje. El backend devuelve las filas crudas
// de la base (snake_case, vía SELECT *), así que las mapeamos acá a camelCase
// para el resto de la app.
export interface SavedHotel {
  id: string;
  name: string;
  checkInDate?: string;
  checkOutDate?: string;
  price?: number;
  currency?: string;
  status: BookingStatus;
  // Categoría de presupuesto a la que cae el gasto cuando se marca este
  // hotel como pagado (tab Gastos) — ver pendingPayments en el dossier.
  budgetCategoryId?: string;
}

// Tramo del vuelo dentro del viaje — puramente informativo (agrupar/
// etiquetar "Ida"/"Vuelta" en la tab Vuelos del dossier), ver schema.sql.
export type FlightLegType = 'departure' | 'return' | 'one_way';

export interface SavedFlight {
  id: string;
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDatetime?: string;
  arrivalDatetime?: string;
  price?: number;
  currency?: string;
  status: BookingStatus;
  legType: FlightLegType;
  hasLayover: boolean;
  layoverAirport?: string;
  layoverDurationMinutes?: number;
  layoverFlightNumber?: string;
  // No se mapeaba antes (nadie la leía) — hace falta para precargar el
  // form de "Editar vuelo" sin pisar notas ya guardadas con un blank.
  notes?: string;
  // Categoría de presupuesto a la que cae el gasto cuando se marca este
  // vuelo como pagado (tab Gastos) — ver pendingPayments en el dossier.
  budgetCategoryId?: string;
}

function mapSavedHotel(r: any): SavedHotel {
  return {
    id: r.id,
    name: r.name,
    // check_in_date/check_out_date son columnas DATE — sin este slice
    // llegaban como el ISO completo que arma pg al parsearlas ('2026-12-
    // 24T03:00:00.000Z', con la hora que le puso el driver, no la fecha
    // que cargó el usuario) y el dossier las mostraba crudas. Mismo
    // criterio que toDateOnly() en mapTrip.
    checkInDate: toDateOnly(r.check_in_date),
    checkOutDate: toDateOnly(r.check_out_date),
    price: r.price != null ? Number(r.price) : undefined,
    currency: r.currency,
    status: r.status,
    budgetCategoryId: r.budget_category_id ?? undefined,
  };
}

function mapSavedFlight(r: any): SavedFlight {
  return {
    id: r.id,
    airline: r.airline ?? undefined,
    flightNumber: r.flight_number,
    departureAirport: r.departure_airport,
    arrivalAirport: r.arrival_airport,
    departureDatetime: r.departure_datetime,
    arrivalDatetime: r.arrival_datetime,
    price: r.price != null ? Number(r.price) : undefined,
    currency: r.currency,
    status: r.status,
    legType: r.leg_type ?? 'one_way',
    hasLayover: r.has_layover ?? false,
    layoverAirport: r.layover_airport ?? undefined,
    layoverDurationMinutes: r.layover_duration_minutes != null ? Number(r.layover_duration_minutes) : undefined,
    layoverFlightNumber: r.layover_flight_number ?? undefined,
    notes: r.notes ?? undefined,
    budgetCategoryId: r.budget_category_id ?? undefined,
  };
}

export async function listTrips(): Promise<Trip[]> {
  const { data } = await apiClient.get('/trips');
  return (data ?? []).map(mapTrip);
}

export async function getTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get(`/trips/${tripId}`);
  return mapTrip(data);
}

export async function createTrip(payload: Partial<Trip>): Promise<Trip> {
  const { data } = await apiClient.post('/trips', payload);
  return mapTrip(data);
}

// Edición de viaje (botón "Editar viaje" del dossier) — el backend ya
// soportaba PATCH /trips/:tripId (título/destino/fechas/estado/moneda),
// pero nada en el cliente lo llamaba todavía.
export async function updateTrip(tripId: string, payload: Partial<Trip>): Promise<Trip> {
  const { data } = await apiClient.patch(`/trips/${tripId}`, payload);
  return mapTrip(data);
}

// Borrado de viaje (botón "Eliminar viaje" del dossier) — el backend ya
// tenía DELETE /trips/:tripId (solo owner), sin usar desde el cliente.
export async function deleteTrip(tripId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}`);
}

export async function getTripDays(tripId: string): Promise<ItineraryDay[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/days`);
  return (data ?? []).map(mapDay);
}

// Alta de día/actividad — el detalle de trip (app/trip/[tripId]/index.tsx)
// solo mostraba el itinerario, sin ninguna forma de cargarlo; el backend ya
// tenía los endpoints (POST /trips/:tripId/days y POST /days/:dayId/activities)
// pero nada en el cliente los llamaba.
export async function createDay(
  tripId: string,
  payload: { dayDate: string; dayNumber: number; notes?: string }
): Promise<ItineraryDay> {
  const { data } = await apiClient.post(`/trips/${tripId}/days`, payload);
  return mapDay(data);
}

export async function createActivity(
  dayId: string,
  payload: {
    title: string;
    category?: ActivityCategory;
    locationName?: string;
    startTime?: string;
    endTime?: string;
    estimatedCost?: number;
    orderIndex?: number;
  }
): Promise<Activity> {
  const { data } = await apiClient.post(`/days/${dayId}/activities`, payload);
  return mapActivity(data);
}

// Borrado de actividad — botón "Eliminar" en el timeline del dossier
// (tab Itinerario). El backend ya tenía DELETE /activities/:activityId
// (resuelve el tripId a partir del día de la actividad para chequear
// permisos), sin usar desde el cliente.
export async function deleteActivity(activityId: string): Promise<void> {
  await apiClient.delete(`/activities/${activityId}`);
}

export async function getTripMapPins(tripId: string): Promise<MapPin[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/map`);
  return data;
}

export async function getTripHotels(tripId: string): Promise<SavedHotel[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/hotels`);
  return (data ?? []).map(mapSavedHotel);
}

export async function getTripFlights(tripId: string): Promise<SavedFlight[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/flights`);
  return (data ?? []).map(mapSavedFlight);
}

// Carga manual de hotel/vuelo (2026-07-01) — reemplaza, por ahora, al flujo
// de "Explorar" contra Amadeus (bloqueado sin AMADEUS_CLIENT_ID/SECRET
// reales en trip-planner-api/.env, ver CONTEXT.md). Pegan contra los MISMOS
// endpoints que ya usaba el guardado de resultados de Amadeus
// (POST /trips/:tripId/hotels y /flights) — esos endpoints nunca dependieron
// de Amadeus, solo insertan filas; `bookingSource: 'manual'` en vez de
// `'amadeus'` es la única diferencia real.
export async function createHotel(
  tripId: string,
  payload: {
    name: string;
    address?: string;
    checkInDate: string;
    checkOutDate: string;
    price?: number;
    currency?: string;
    notes?: string;
    budgetCategoryId?: string;
  }
): Promise<SavedHotel> {
  const { data } = await apiClient.post(`/trips/${tripId}/hotels`, { ...payload, bookingSource: 'manual' });
  return mapSavedHotel(data);
}

export interface FlightFormPayload {
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDatetime: string;
  arrivalDatetime: string;
  price?: number;
  currency?: string;
  notes?: string;
  legType?: FlightLegType;
  hasLayover?: boolean;
  // `null` explícito (en vez de simplemente omitir el campo) para poder
  // limpiar la escala al editar un vuelo que la tenía y ahora no — el PATCH
  // del backend usa COALESCE por columna, que solo respeta un `null`
  // explícito para "borrar"; omitir el campo significa "no tocar".
  layoverAirport?: string | null;
  layoverDurationMinutes?: number | null;
  layoverFlightNumber?: string | null;
  budgetCategoryId?: string;
}

export async function createFlight(tripId: string, payload: FlightFormPayload): Promise<SavedFlight> {
  const { data } = await apiClient.post(`/trips/${tripId}/flights`, { ...payload, bookingSource: 'manual' });
  return mapSavedFlight(data);
}

// Edición de vuelo (botón "Editar" en la tab Vuelos del dossier, 2026-07-04)
// — el backend ya soporta PATCH /flights/:id con todos los campos (antes
// solo status/price/notes), sin usar desde el cliente hasta ahora.
export async function updateFlight(flightId: string, payload: Partial<FlightFormPayload>): Promise<SavedFlight> {
  const { data } = await apiClient.patch(`/flights/${flightId}`, payload);
  return mapSavedFlight(data);
}

// Estimación aproximada de llegada (form de Reservas, Ida/Vuelta/Interno)
// — geocoding + distancia en línea recta, NO el horario real del vuelo.
// layoverMinutes (opcional) suma el tiempo de espera de la escala a la
// duración estimada. Devuelve null si el backend no pudo ubicar alguno de
// los aeropuertos (aerolínea rara, código mal tipeado, etc.) en vez de
// tirar; el form decide qué hacer con eso (pedir la llegada a mano).
export interface FlightEstimate {
  arrivalDatetime: string;
  estimatedDurationMinutes: number;
  distanceKm: number;
}

export async function estimateFlightArrival(
  origin: string,
  destination: string,
  departureDatetime: string,
  layoverMinutes?: number
): Promise<FlightEstimate | null> {
  try {
    const { data } = await apiClient.get('/flights/estimate-arrival', {
      params: { origin, destination, departureDatetime, layoverMinutes: layoverMinutes || undefined },
    });
    return data;
  } catch {
    return null;
  }
}

// Borrado de hotel/vuelo guardado — botón "Eliminar" en las tabs
// Hoteles/Vuelos del dossier. Mismos endpoints DELETE /hotels/:id y
// /flights/:id que ya existían en el backend sin usar desde el cliente.
export async function deleteHotel(hotelId: string): Promise<void> {
  await apiClient.delete(`/hotels/${hotelId}`);
}

export async function deleteFlight(flightId: string): Promise<void> {
  await apiClient.delete(`/flights/${flightId}`);
}
