# trip-planner — ViajaYa

Plataforma para organizar viajes: itinerario día a día, presupuesto y
gastos reales, hoteles, vuelos y mapa. Proyecto de aprendizaje full-stack
(React Native/Expo + Node/Express + PostgreSQL), con foco en mapas, APIs
externas y geolocalización. En la UI la app se llama **ViajaYa**.

> Para el historial detallado de decisiones y cambios, ver `CONTEXT.md`
> (bitácora cronológica) y `API_DESIGN.md` (contrato REST completo).

## Estructura

```
trip-planner/
  schema.sql              Esquema PostgreSQL completo (fuente de verdad)
  migrations/              Migraciones incrementales timestamped (ver abajo)
  erd.mermaid              Diagrama entidad-relación
  API_DESIGN.md            Contrato REST completo (endpoints, auth, roles)
  CONTEXT.md               Bitácora del proyecto (qué se hizo y por qué)
  CLAUDE.md                Guía para agentes de IA trabajando en el repo
  trip-planner-api/        Backend Node/Express + TypeScript
  trip-planner-app/        Frontend Expo (iOS + Android + web)
```

Cada subproyecto tiene su propio README con detalle de setup. Este archivo
es el mapa general y la guía para correr todo junto.

## Levantar el entorno completo

1. **Base de datos** — PostgreSQL local:

   Instalación nueva (desde cero):
   ```bash
   createdb trip_planner
   psql trip_planner -f schema.sql
   ```

   Base ya existente (aplicar cambios incrementales en orden): correr cada
   archivo de `migrations/` una sola vez, en orden por nombre (son
   idempotentes — usan `IF NOT EXISTS`/chequeos contra `pg_constraint`, así
   que correrlos de nuevo no rompe nada):
   ```bash
   for f in migrations/*.sql; do psql trip_planner -f "$f"; done
   ```
   No hay un runner de migraciones — el orden y qué ya se aplicó se
   trackea a mano. `schema.sql` siempre refleja el resultado final (una
   base nueva con `schema.sql` a secas queda igual que una vieja con todas
   las migraciones aplicadas).

2. **Backend**:
   ```bash
   cd trip-planner-api
   npm install
   cp .env.example .env   # completar DATABASE_URL y JWT_SECRET como mínimo
   npm run dev            # tsx watch → http://localhost:3000
   ```
   Variables opcionales en `.env`: `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`
   (búsqueda real de hoteles/vuelos, hoy en pausa sin credenciales) y
   `GOOGLE_MAPS_API_KEY` (geocoding de lugares/direcciones; sin esto cae
   automáticamente a Nominatim/OpenStreetMap, gratis y sin key).

3. **Frontend**:
   ```bash
   cd trip-planner-app
   npm install
   cp .env.example .env   # EXPO_PUBLIC_API_URL apuntando a tu IP local:3000
   npm start              # QR para Expo Go, o:
   npm run web            # expo start --web
   ```
   `EXPO_PUBLIC_API_URL` tiene que incluir `/api/v1` y, si vas a probar en
   un celular físico con Expo Go, apuntar a la IP LAN de tu máquina (no
   `localhost`).

Con eso: registro/login, itinerario, presupuesto + gastos reales, hoteles,
vuelos y mapa funcionan de punta a punta contra una base real.

No hay suite de tests en ninguno de los dos proyectos. Health check del
backend: `GET /health`. El único chequeo automatizado del frontend es
`npm run lint` (ESLint).

## Stack y por qué

| Pieza | Elegido | Por qué |
|---|---|---|
| Frontend | Expo Router (React Native + web), Expo SDK 54 / React 19.1 / RN 0.81 | Un solo código para iOS, Android y web |
| Backend | Node/Express + TypeScript + PostgreSQL (`pg`) | Datos relacionales (viaje → días → actividades, presupuesto con joins) |
| Validación | `zod` | Body de cada POST/PATCH validado antes de tocar la base (`src/schemas.ts` + middleware `validateBody`) |
| Mapas | `react-native-maps` (nativo) + Leaflet vía CDN (web, sin dependencia nueva) | Funciona en Expo Go sin build nativo; web no tiene build de `react-native-maps` |
| Geocoding | Google Geocoding API (si hay API key) → Nominatim/OSM como fallback | Convierte lugar/dirección de texto a lat/lng para el mapa, sin bloquear el guardado si falla |
| Vuelos/hoteles | Amadeus Self-Service (proxy server-side) + carga manual | Sandbox gratuito, pero en pausa por falta de credenciales reales — mientras tanto, carga manual contra los mismos endpoints |
| Auth | JWT + bcrypt | Mismo patrón que otros proyectos del autor |
| Estado compartido (front) | Zustand (`selectedTrip`) | Qué viaje está "activo" para pantallas que no reciben `tripId` por la URL |

Deliberadamente **sin** dependencias nuevas de UI (`react-native-svg`,
`@react-native-community/datetimepicker`, `react-leaflet`, Google Fonts):
selectores de fecha/hora/moneda, barras de progreso y el mapa web están
hechos a mano con `View`/`StyleSheet` o cargando Leaflet por CDN, porque las
sesiones de desarrollo no siempre pudieron correr `npm install` para
validar una dependencia nueva. Quedan como mejoras futuras (ver Pendiente).

## Estado actual

**Backend** — auth (JWT+bcrypt), autorización por rol (`requireTripAccess`:
owner/editor/viewer), trips + colaboradores, itinerario (días + actividades
con reorder), presupuesto (categorías planificadas + gastos reales +
resumen agregado), hoteles/vuelos (con `leg_type` Ida/Vuelta/Interno,
escala, estimación de llegada, y proxy a Amadeus en pausa), geocoding
(Google + fallback Nominatim), endpoint agregado de mapa. Validación `zod`
en todos los POST/PATCH. Schema con checks de rango (lat/lng), formato de
moneda, montos no negativos, `updated_at` + trigger en toda tabla editable,
e índices de soporte en los FK más consultados.

**Frontend** — header compartido (`AppHeader`) con nav (Mis viajes /
Reservas / Perfil), botón "← Volver" a Inicio en toda pantalla que no sea
Inicio, y avatar con datos reales del usuario. Inicio con carrusel de
próximos viajes (tarjeta de embarque) y estadísticas con barras de
progreso + mini gráfico de reservas. Reservas: carga manual de
hoteles/vuelos (búsqueda automática contra Amadeus en pausa). Mapa nativo
+ web (Leaflet). Dossier de cada viaje (`/trip/:id`) con pestañas
Itinerario / Presupuesto / Gastos / Hoteles / Vuelos / Mapa — Presupuesto
tiene categorías planificadas + gráfico, Gastos el registro de gastos
reales (separados en "previa"/"durante el viaje").

## Pendiente

- Borrar `trip-planner-app/app/(tabs)/budget.tsx` (quedó como redirect
  muerto tras mover toda la gestión de presupuesto al dossier) y sacar su
  `<Stack.Screen name="budget" />` de `app/(tabs)/_layout.tsx` — no rompe
  nada dejarlo, es solo prolijidad.
- Cargar credenciales reales de Amadeus (`AMADEUS_CLIENT_ID`/`_SECRET` en
  `trip-planner-api/.env`) para reactivar la búsqueda automática de
  hoteles/vuelos y el autocompletado de ciudades/aeropuertos.
- Instalar las fuentes del diseño ("Rumbo": Space Grotesk/Inter/Space
  Mono vía `@expo-google-fonts`) — hoy usa fuentes de sistema como
  aproximación.
- Si en algún momento se puede instalar dependencias nuevas: evaluar
  `react-native-svg` (arcos de progreso reales en vez de barras/insignias),
  `react-leaflet` (en vez del CDN de Leaflet en `map.web.tsx`) y
  `@react-native-community/datetimepicker` (look más nativo que
  `DatePickerField`/`TimePickerField` propios).
