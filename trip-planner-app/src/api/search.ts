import { apiClient } from './client';

// Búsqueda de hoteles/vuelos contra el proxy de Amadeus del backend
// (/hotels/search y /flights/search). El backend reenvía la respuesta cruda
// de Amadeus, que es anidada y verbosa; acá la aplanamos a modelos simples
// para las tarjetas, parseando de forma defensiva (los campos opcionales de
// Amadeus pueden faltar según el resultado).
//
// EN PAUSA (2026-07-01): nada de este archivo se usa hoy — app/(tabs)/explore.tsx
// se reescribió para carga manual (src/api/trips.ts → createHotel/createFlight)
// mientras trip-planner-api/.env no tenga AMADEUS_CLIENT_ID/SECRET reales (ver
// CONTEXT.md). No se borró porque sigue siendo válido: apenas haya credenciales,
// esta lógica de búsqueda/autocompletado se puede volver a enchufar en Explorar
// (o en una pantalla nueva) sin reescribirla de cero.

export interface HotelResult {
  id: string;
  name: string;
  cityCode?: string;
  checkInDate?: string;
  checkOutDate?: string;
  // Amadeus (v3 hotel-offers) devuelve price.total como el total de TODA la
  // estadía, no una tarifa por noche — hay que dividir por `nights` para
  // mostrar el precio por noche. Ver nightsBetween() más abajo.
  price?: string;
  currency?: string;
  nights?: number;
}

export interface FlightResult {
  id: string;
  from: string;
  to: string;
  departAt?: string;
  arriveAt?: string;
  carrier?: string;
  stops: number;
  price?: string;
  currency?: string;
}

export interface HotelSearchParams {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
}

export interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  adults: string;
}

// Noches entre dos fechas ISO (AAAA-MM-DD). Devuelve undefined si faltan
// datos o el rango no tiene sentido, para no dividir por 0 ni mostrar
// negativos.
function nightsBetween(checkIn?: string, checkOut?: string): number | undefined {
  if (!checkIn || !checkOut) return undefined;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) return undefined;
  const diffDays = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : undefined;
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelResult[]> {
  const { data } = await apiClient.get('/hotels/search', { params });
  return (data?.data ?? []).map((entry: any, i: number): HotelResult => {
    const offer = entry?.offers?.[0];
    const checkInDate = offer?.checkInDate ?? params.checkInDate;
    const checkOutDate = offer?.checkOutDate ?? params.checkOutDate;
    return {
      id: entry?.hotel?.hotelId ?? String(i),
      name: entry?.hotel?.name ?? 'Hotel sin nombre',
      cityCode: entry?.hotel?.cityCode,
      checkInDate,
      checkOutDate,
      price: offer?.price?.total,
      currency: offer?.price?.currency,
      nights: nightsBetween(checkInDate, checkOutDate),
    };
  });
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightResult[]> {
  const { data } = await apiClient.get('/flights/search', { params });
  return (data?.data ?? []).map((offer: any, i: number): FlightResult => {
    const segments = offer?.itineraries?.[0]?.segments ?? [];
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      id: offer?.id ?? String(i),
      from: first?.departure?.iataCode ?? '???',
      to: last?.arrival?.iataCode ?? '???',
      departAt: first?.departure?.at,
      arriveAt: last?.arrival?.at,
      carrier: first?.carrierCode ? `${first.carrierCode}${first.number ?? ''}` : undefined,
      stops: Math.max(segments.length - 1, 0),
      price: offer?.price?.total,
      currency: offer?.price?.currency,
    };
  });
}

// Guarda un resultado de búsqueda como candidato del viaje (status
// 'candidate' por default en la base). El backend valida rol editor/owner.
// Amadeus no siempre trae las fechas en el resultado, así que las de check-in
// /check-out del formulario van como fallback.
export async function saveHotel(
  tripId: string,
  hotel: HotelResult,
  fallbackDates: { checkInDate: string; checkOutDate: string }
): Promise<void> {
  await apiClient.post(`/trips/${tripId}/hotels`, {
    name: hotel.name,
    checkInDate: hotel.checkInDate ?? fallbackDates.checkInDate,
    checkOutDate: hotel.checkOutDate ?? fallbackDates.checkOutDate,
    price: hotel.price != null ? Number(hotel.price) : undefined,
    currency: hotel.currency,
    bookingSource: 'amadeus',
    externalOfferId: hotel.id,
  });
}

// Autocompletado de ciudad/aeropuerto — reemplaza tener que saber de
// memoria el código IATA en los forms de hoteles/vuelos.
export interface LocationResult {
  iataCode: string;
  name: string;
  cityName?: string;
  countryName?: string;
  subType: 'CITY' | 'AIRPORT';
}

export async function searchLocations(keyword: string): Promise<LocationResult[]> {
  if (keyword.trim().length < 2) return [];
  const { data } = await apiClient.get('/locations/search', { params: { keyword } });
  return (data?.data ?? [])
    .map((entry: any): LocationResult => ({
      iataCode: entry?.iataCode ?? '',
      name: entry?.name ?? '',
      cityName: entry?.address?.cityName,
      countryName: entry?.address?.countryName,
      subType: entry?.subType,
    }))
    .filter((loc: LocationResult) => loc.iataCode);
}

export async function saveFlight(tripId: string, flight: FlightResult): Promise<void> {
  await apiClient.post(`/trips/${tripId}/flights`, {
    flightNumber: flight.carrier,
    departureAirport: flight.from,
    arrivalAirport: flight.to,
    departureDatetime: flight.departAt,
    arrivalDatetime: flight.arriveAt,
    price: flight.price != null ? Number(flight.price) : undefined,
    currency: flight.currency,
    bookingSource: 'amadeus',
    externalOfferId: flight.id,
  });
}
