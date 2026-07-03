// Geocoding: texto ("Hotel Central, Salta") → coordenadas. Google
// Geocoding API es la opción principal (más precisa que Nominatim,
// especialmente con nombres de lugar genéricos), pero pide
// GOOGLE_MAPS_API_KEY en .env (Google Cloud Console → habilitar
// "Geocoding API" → credenciales). Si esa key no está cargada, cae solo a
// Nominatim (OpenStreetMap) — gratis, sin key, mismo comportamiento que
// antes de sumar Google. Ninguna de las dos bloquea el guardado de la
// actividad/hotel si falla: siempre devuelve `null` en vez de tirar error.

interface GeocodeResult {
  lat: number;
  lng: number;
}

async function geocodeWithGoogle(query: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[geocoding] Google respondió HTTP ${response.status} para "${query}"`);
      return null;
    }
    const data = (await response.json()) as {
      status: string;
      error_message?: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    if (data.status !== 'OK') {
      // Estados típicos: ZERO_RESULTS (no encontró nada), REQUEST_DENIED
      // (key inválida o "Geocoding API" no habilitada en el proyecto de
      // Google Cloud), OVER_QUERY_LIMIT (se acabó la cuota gratuita).
      console.warn(`[geocoding] Google devolvió "${data.status}" para "${query}"${data.error_message ? `: ${data.error_message}` : ''}`);
      return null;
    }
    const location = data.results[0]?.geometry?.location;
    return location ? { lat: location.lat, lng: location.lng } : null;
  } catch (err) {
    console.warn(`[geocoding] Falló la request a Google para "${query}":`, err);
    return null;
  }
}

async function geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url, {
      headers: {
        // Nominatim rechaza el User-Agent default de fetch/node — pide uno
        // que identifique la app.
        'User-Agent': 'ViajaYa-TripPlanner/1.0 (proyecto de aprendizaje, sin sitio publico)',
      },
    });
    if (!response.ok) {
      console.warn(`[geocoding] Nominatim respondió ${response.status} para "${query}"`);
      return null;
    }
    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      console.warn(`[geocoding] Nominatim no encontró resultados para "${query}"`);
      return null;
    }
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch (err) {
    console.warn(`[geocoding] Falló la request a Nominatim para "${query}":`, err);
    return null;
  }
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const viaGoogle = await geocodeWithGoogle(trimmed);
  if (viaGoogle) return viaGoogle;

  // Sin GOOGLE_MAPS_API_KEY, o Google no encontró nada: Nominatim como
  // segunda oportunidad antes de rendirse.
  return geocodeWithNominatim(trimmed);
}
