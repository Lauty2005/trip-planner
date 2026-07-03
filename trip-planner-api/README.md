# trip-planner-api

Backend Node/Express + TypeScript + PostgreSQL para la plataforma de viajes.
Implementa el esquema de `../schema.sql` y los endpoints de `../API_DESIGN.md`.

## Requisitos

- Node.js 20+
- PostgreSQL 14+ corriendo localmente (o accesible por red)

## Setup

```bash
npm install
cp .env.example .env
```

Editá `.env` con tu `DATABASE_URL` y un `JWT_SECRET` propio. Después corré el
schema contra tu base:

```bash
psql "$DATABASE_URL" -f ../schema.sql
```

## Correr en desarrollo

```bash
npm run dev
```

Levanta en `http://localhost:3000`. Probá que esté vivo con:

```bash
curl http://localhost:3000/health
```

## Estructura

```
src/
  db/pool.ts              Conexión a PostgreSQL (pg.Pool)
  middleware/
    auth.ts                Verifica el JWT (requireAuth)
    tripAccess.ts           Verifica owner/collaborator por trip (requireTripAccess)
  routes/                   Un archivo por recurso, calcado de ../API_DESIGN.md
  services/amadeus.ts       Proxy a Amadeus (OAuth2 + búsqueda de hoteles/vuelos)
  utils/jwt.ts               Firma/verifica tokens
  app.ts                     Registro de rutas + manejador de errores
  server.ts                  Punto de entrada
```

## Cómo se maneja la autorización

Cada ruta bajo `/trips/:tripId/*` pasa por `requireTripAccess(minRole)`, que:
1. Busca el trip y ve si el usuario autenticado es `owner_id`.
2. Si no, busca en `trip_collaborators` su rol (`editor` o `viewer`).
3. Devuelve 403 si el rol no alcanza el mínimo pedido por la ruta (las rutas
   de solo lectura piden `viewer`; las de escritura, `editor`).

Para recursos anidados (`activities`, `expenses`, `hotels`, etc.) que no
traen `tripId` en la URL, cada ruta primero resuelve a qué trip pertenecen
(por ejemplo, una actividad pertenece a un día que pertenece a un trip) y
recién ahí aplica el mismo chequeo. Ese patrón invoca el middleware "a mano"
(`await requireTripAccess(rol)(req, res, callback)`); el `await` es clave
para que los errores del callback lleguen al `catch` de la ruta.

## Conectar con el frontend Expo

En `../trip-planner-app/.env`, apuntá `EXPO_PUBLIC_API_URL` a esta API
(usando tu IP local, no `localhost`, si vas a probar desde el celular).

## Pendiente / próximos pasos

- Validación de body con `zod` (ya está en las dependencias, falta usarlo en cada ruta)
- Tests de integración para `requireTripAccess`
- Paginación real en `/trips` y `/expenses`
