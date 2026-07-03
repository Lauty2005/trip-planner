// Cliente mínimo para Amadeus Self-Service (sandbox). Maneja el OAuth2
// client_credentials y cachea el token en memoria hasta que expira.
// Nunca se llama directo desde el cliente: siempre a través del backend.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const response = await fetch(`${process.env.AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID ?? '',
      client_secret: process.env.AMADEUS_CLIENT_SECRET ?? '',
    }),
  });

  if (!response.ok) {
    throw new Error(`No se pudo autenticar con Amadeus (status ${response.status})`);
  }

  const data = await response.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function amadeusGet(path: string, params: Record<string, string>) {
  const token = await getAccessToken();
  const url = new URL(`${process.env.AMADEUS_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Amadeus respondió ${response.status} para ${path}`);
  }
  return response.json();
}

export function searchFlightOffers(params: {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  adults: string;
}) {
  return amadeusGet('/v2/shopping/flight-offers', params);
}

export function searchHotelOffers(params: { cityCode: string; checkInDate: string; checkOutDate: string }) {
  return amadeusGet('/v3/shopping/hotel-offers', params);
}

// Autocompletado de ciudad/aeropuerto para los forms de hoteles/vuelos —
// evita que el usuario tenga que saber de memoria el código IATA.
export function searchLocations(params: { keyword: string }) {
  return amadeusGet('/v1/reference-data/locations', {
    keyword: params.keyword,
    subType: 'CITY,AIRPORT',
    'page[limit]': '8',
  });
}
