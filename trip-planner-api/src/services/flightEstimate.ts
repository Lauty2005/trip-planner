import { geocode } from './geocoding.js';

// Estimación GRUESA de horario de llegada a partir de origen/destino —
// pensada para el caso "vuelo interno en medio del viaje" del form de
// Reservas, donde el usuario solo quiere cargar la salida y no sabe (o no
// le importa tipear) la llegada exacta. NO es el horario real del vuelo:
// no usa datos de aerolíneas ni rutas reales, solo geocodifica los dos
// aeropuertos (reutilizando services/geocoding.ts — Google/Nominatim, ya
// integrado) y calcula distancia en línea recta (Haversine) sobre una
// velocidad de crucero promedio + un margen fijo de despegue/aterrizaje/
// rodaje. Sirve para tener un valor de partida razonable; el usuario
// siempre puede sobrescribirlo a mano.

const EARTH_RADIUS_KM = 6371;
const CRUISE_SPEED_KMH = 800; // velocidad de crucero promedio de un jet comercial
const OVERHEAD_MINUTES = 45; // despegue + aterrizaje + rodaje, aprox.

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Formatea en el mismo formato "naive" (sin offset de timezone) que usa el
// resto de la app para datetimes de vuelos/hoteles (ver toDatetime() en
// trip-planner-app/app/(tabs)/explore.tsx) — a propósito NO se usa
// toISOString() acá porque eso convierte a UTC, y esta app en ningún lado
// maneja husos horarios reales todavía.
function formatLocalDatetime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}:${s}`;
}

export interface FlightEstimate {
  arrivalDatetime: string;
  estimatedDurationMinutes: number;
  distanceKm: number;
}

export async function estimateArrival(
  origin: string,
  destination: string,
  departureDatetime: string,
  layoverMinutes = 0
): Promise<FlightEstimate | null> {
  const [originGeo, destGeo] = await Promise.all([geocode(`${origin} airport`), geocode(`${destination} airport`)]);
  if (!originGeo || !destGeo) return null;

  const distanceKm = haversineKm(originGeo, destGeo);
  // Si el vuelo tiene escala, el tiempo de espera en el aeropuerto
  // intermedio se suma de lleno a la duración total — la estimación es de
  // "salida a llegada final", no solo del tramo de vuelo en el aire.
  const durationMinutes = Math.round((distanceKm / CRUISE_SPEED_KMH) * 60) + OVERHEAD_MINUTES + Math.max(0, layoverMinutes);

  const departure = new Date(departureDatetime);
  if (Number.isNaN(departure.getTime())) return null;
  const arrival = new Date(departure.getTime() + durationMinutes * 60_000);

  return {
    arrivalDatetime: formatLocalDatetime(arrival),
    estimatedDurationMinutes: durationMinutes,
    distanceKm: Math.round(distanceKm),
  };
}
