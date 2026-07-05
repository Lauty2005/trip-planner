// Cliente para AeroDataBox vía RapidAPI — completa automáticamente
// aeropuerto/horario de un vuelo a partir de su número (aerolínea + código,
// ej. 'AR1234') + fecha, para el botón "Buscar vuelo" del form de Reservas
// (2026-07-07, a pedido de Lautaro). Es una API DISTINTA de Amadeus (Flight
// Offers Search no sirve para esto: busca por origen/destino, no por
// número de vuelo puntual) — se eligió AeroDataBox en vez de ampliar
// Amadeus con su "On-Demand Flight Status" porque Lautaro prefirió no
// depender de otra alta en Amadeus; AeroDataBox tiene un tier gratis de
// ~600 unidades/mes vía RapidAPI, más simple para este proyecto de
// aprendizaje. Requiere una API key propia de RapidAPI en
// AERODATABOX_RAPIDAPI_KEY (.env) — sin eso, lookupFlightByNumber tira un
// error claro en vez de un 401 crudo de RapidAPI.

const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

export interface FlightLookupResult {
  airline?: string;
  flightNumber: string;
  departureAirport?: string;
  arrivalAirport?: string;
  // Formato "naive" local (sin offset de timezone) — mismo criterio que
  // formatLocalDatetime en flightEstimate.ts: esta app no maneja husos
  // horarios reales todavía, así que se toma el wall-clock que da
  // AeroDataBox para cada aeropuerto tal cual, sin convertir a UTC.
  departureDatetime?: string;
  arrivalDatetime?: string;
}

// Corta el offset ('+02:00', '-05:00' o 'Z') de un string tipo
// '2026-07-20T14:30:00+02:00', dejando el wall-clock intacto.
function stripOffset(local?: string): string | undefined {
  if (!local) return undefined;
  return local.replace(/([+-]\d{2}:\d{2}|Z)$/, '');
}

export async function lookupFlightByNumber(params: {
  flightNumber: string; // aerolínea + número juntos, ej: 'AR1234' (sin espacios)
  date: string; // YYYY-MM-DD, fecha de salida
}): Promise<FlightLookupResult[]> {
  const apiKey = process.env.AERODATABOX_RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error('Falta configurar AERODATABOX_RAPIDAPI_KEY en el .env del backend');
  }

  const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(params.flightNumber)}/${params.date}?dateLocalRole=Departure`;
  const response = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`AeroDataBox respondió ${response.status} para ${params.flightNumber}`);
  }

  const data = await response.json();
  const flights = Array.isArray(data) ? data : [];
  // Puede haber más de un resultado (codeshares del mismo vuelo físico bajo
  // distintos números/aerolíneas) — se devuelven todos y el form decide qué
  // hacer si hay más de uno (usar el primero y avisar).
  return flights.map((f: any) => ({
    airline: f.airline?.name,
    flightNumber: (f.number ?? params.flightNumber).replace(/\s+/g, ''),
    departureAirport: f.departure?.airport?.iata,
    arrivalAirport: f.arrival?.airport?.iata,
    departureDatetime: stripOffset(f.departure?.scheduledTime?.local),
    arrivalDatetime: stripOffset(f.arrival?.scheduledTime?.local),
  }));
}
