# trip-planner-app (Expo)

Frontend mobile + web de la plataforma de organización de viajes, hecho con
Expo Router. Comparte código entre iOS, Android y web.

## Requisitos

- Node.js 20+
- La app Expo Go instalada en tu celular (para probar rápido sin build nativo)
- El backend (`../trip-planner-api`) corriendo — ver `../API_DESIGN.md` y
  `../schema.sql` en la raíz del monorepo

## Setup

```bash
npm install
cp .env.example .env
```

Editá `.env` y poné la IP de tu compu en la red WiFi (no `localhost`, porque
el celular con Expo Go no puede resolverlo):

```
EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:3000/api/v1
```

## Correr la app

```bash
npm start
```

Esto abre el Metro bundler. Desde ahí:
- Escaneá el QR con Expo Go (Android) o la cámara (iOS) para probar en el celular
- Apretá `w` para abrir la versión web
- Apretá `a` / `i` para emulador Android / simulador iOS (requieren Android
  Studio / Xcode instalados)

## Mapas: nota importante sobre Expo Go

`react-native-maps` funciona en Expo Go usando el proveedor de Google Maps en
Android sin configuración extra. Para iOS usa Apple Maps nativo. Si más
adelante migrás a Mapbox (`rnmapbox/maps`) para tener estilos custom, vas a
necesitar un **development build** (`npx expo run:ios` / `run:android`)
porque esa librería no corre en Expo Go.

## Estructura

```
app/                  Rutas (Expo Router — cada archivo es una pantalla)
  (auth)/login.tsx
  (tabs)/             Tabs principales: viajes, mapa, presupuesto, perfil
src/
  api/                Cliente HTTP + funciones por recurso (trips, hotels...)
  types/              Tipos TS espejando schema.sql
```

## Próximos pasos sugeridos

1. Pantalla de detalle de trip (`app/trip/[tripId]/index.tsx`) con el itinerario día por día
2. Conectar `budget.tsx` con `/trips/:tripId/budget/summary`
3. Formulario de creación de trip
4. Búsqueda de hoteles/vuelos vía `/hotels/search` y `/flights/search` (proxy a Amadeus)
