# API Design — Plataforma de Viajes

Base URL: `/api/v1`
Auth: JWT en header `Authorization: Bearer <token>`, igual que en bookmark-app.
Formato de respuesta: JSON. Errores como `{ "error": { "code": "...", "message": "..." } }`.

Regla de autorización transversal: toda ruta bajo `/trips/:tripId/*` valida que el usuario sea `owner` o esté en `trip_collaborators` para ese trip antes de tocar el recurso. Las rutas de escritura (POST/PATCH/DELETE) sobre hoteles, vuelos y presupuesto además chequean rol `editor` u `owner` (no `viewer`).

## Auth

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Crea usuario (email, password, name) |
| POST | `/auth/login` | Devuelve JWT |
| GET | `/auth/me` | Perfil del usuario autenticado |

## Trips

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trips` | Lista trips donde el usuario es owner o colaborador |
| POST | `/trips` | Crea trip (title, destination, dates, currency) |
| GET | `/trips/:tripId` | Detalle del trip |
| PATCH | `/trips/:tripId` | Editar trip (solo owner) |
| DELETE | `/trips/:tripId` | Elimina trip (solo owner, cascada borra todo lo asociado) |

## Colaboradores (viajes compartidos)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trips/:tripId/collaborators` | Lista colaboradores |
| POST | `/trips/:tripId/collaborators` | Invita por email (role: editor/viewer) |
| DELETE | `/trips/:tripId/collaborators/:userId` | Quita colaborador |

## Itinerario

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trips/:tripId/days` | Lista días con sus actividades anidadas |
| POST | `/trips/:tripId/days` | Crea día (day_date, day_number) |
| PATCH | `/days/:dayId` | Edita notas del día |
| DELETE | `/days/:dayId` | Elimina día (cascada borra actividades) |
| POST | `/days/:dayId/activities` | Crea actividad (title, category, lat/lng, horario) |
| PATCH | `/activities/:activityId` | Edita actividad |
| DELETE | `/activities/:activityId` | Elimina actividad |
| PATCH | `/days/:dayId/activities/reorder` | Actualiza `order_index` en batch (drag & drop) |

## Presupuesto

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trips/:tripId/budget-categories` | Lista categorías planificadas |
| POST | `/trips/:tripId/budget-categories` | Crea categoría (name, planned_amount) |
| PATCH | `/budget-categories/:id` | Edita categoría |
| DELETE | `/budget-categories/:id` | Elimina categoría |
| GET | `/trips/:tripId/expenses` | Lista gastos reales (filtros: category, date range) |
| POST | `/trips/:tripId/expenses` | Registra gasto |
| PATCH | `/expenses/:id` | Edita gasto |
| DELETE | `/expenses/:id` | Elimina gasto |
| GET | `/trips/:tripId/budget/summary` | Agregado: planificado vs gastado por categoría + total |

## Hoteles

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/hotels/search` | Proxy server-side a Amadeus Hotel Search (oculta la API key) |
| GET | `/trips/:tripId/hotels` | Lista hoteles guardados/reservados del trip |
| POST | `/trips/:tripId/hotels` | Guarda hotel (manual o desde resultado de búsqueda) |
| PATCH | `/hotels/:id` | Edita |
| PUT | `/hotels/:id/shares` | Arma/reemplaza el reparto del hotel entre viajeros (`{ shares: [{userId, amount}] }`) — nunca toca una parte ya pagada |
| DELETE | `/hotels/:id` | Elimina |

## Vuelos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/flights/search` | Proxy server-side a Amadeus Flight Offers Search |
| GET | `/flights/estimate-arrival` | Estima `arrivalDatetime` a partir de `origin`/`destination`/`departureDatetime` (geocoding + distancia, aproximado — no es el horario real del vuelo) |
| GET | `/flights/lookup?flightNumber=&date=` | Busca un vuelo puntual (ej. `flightNumber=AR1234`) vía AeroDataBox y devuelve aeropuertos/horarios reales para autocompletar el form — requiere `AERODATABOX_RAPIDAPI_KEY` en `.env`, si no responde 503 `not_configured` |
| GET | `/trips/:tripId/flights` | Lista vuelos guardados/reservados del trip |
| POST | `/trips/:tripId/flights` | Guarda vuelo (incluye `legType`: `departure`\|`return`\|`one_way`, y datos de escala opcionales) |
| PATCH | `/flights/:id` | Edita |
| PUT | `/flights/:id/shares` | Arma/reemplaza el reparto del vuelo entre viajeros (`{ shares: [{userId, amount}] }`) — nunca toca una parte ya pagada |
| DELETE | `/flights/:id` | Elimina |

## Reparto de hoteles/vuelos compartidos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/booking-shares/:id/pay` | Marca la parte de UN viajero como pagada (`{ paidDate? }`, default hoy) — crea el gasto real a su nombre y lo vincula de vuelta al reparto |

## Ubicaciones (autocompletado)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/locations/search?keyword=` | Proxy server-side a Amadeus Location Search (ciudades + aeropuertos), usado para autocompletar los campos de ciudad/origen/destino en la búsqueda de hoteles/vuelos. Con `keyword` de menos de 2 caracteres devuelve `{ data: [] }` sin llamar a Amadeus. |

## Mapa / lugares guardados

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/trips/:tripId/places` | Lista pines libres (miradores, restaurantes, etc.) |
| POST | `/trips/:tripId/places` | Crea pin (name, category, lat, lng, notes) |
| PATCH | `/places/:id` | Edita pin |
| DELETE | `/places/:id` | Elimina pin |
| GET | `/trips/:tripId/map` | Agregado: activities + hotels + places con lat/lng, listo para renderizar todos los pines del mapa en una sola llamada |

## Notas de seguridad e integración

- **Amadeus**: las API keys nunca viajan al cliente (ni web ni mobile). `/hotels/search`, `/flights/search` y `/locations/search` son endpoints propios que llaman a Amadeus desde el backend con las credenciales guardadas en variables de entorno, y devuelven solo los campos que la app necesita.
- **Mapbox**: el token público de Mapbox sí puede ir en el cliente (React Native / web) — está diseñado para eso, a diferencia de Amadeus. No hace falta proxyearlo.
- **Geolocalización**: no pasa por el backend; `expo-location` obtiene lat/lng en el dispositivo y se envía solo si el usuario crea una actividad/pin en su ubicación actual.
- **Paginación**: listas largas (`/trips`, `/expenses`) deberían soportar `?page=&limit=` desde el principio para no rehacerlo después.
