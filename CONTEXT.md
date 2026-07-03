# Contexto del proyecto — trip-planner

Resumen de lo hecho hasta ahora (última actualización: 2026-07-03). Pensado
para retomar el trabajo sin tener que releer todo el historial de chat.
Las secciones de abajo ("Qué es", "Estructura", "Backend", "Frontend") son
una foto del estado ACTUAL; el resto del archivo, después de "Gotchas", es
una bitácora cronológica (más abajo = más reciente) que explica el porqué
de cada decisión — si algo de la bitácora contradice estas secciones de
arriba, gana lo de arriba.

## Qué es

Plataforma para organizar viajes (itinerario día a día, presupuesto y
gastos reales, hoteles, vuelos, mapa), pensada como proyecto de aprendizaje
full-stack con foco en mapas, APIs externas y geolocalización. Nombre de
marca en la UI: **ViajaYa**.

## Estructura

```
trip-planner/
  schema.sql            Esquema PostgreSQL completo (fuente de verdad)
  migrations/            Migraciones incrementales timestamped (ver Backend)
  erd.mermaid             Diagrama entidad-relación
  API_DESIGN.md            Contrato REST completo
  README.md                Mapa general + guía de setup
  trip-planner-api/        Backend Node/Express + TypeScript
  trip-planner-app/        Frontend Expo (iOS + Android + web)
```

## Backend (`trip-planner-api`)

Node/Express + TypeScript + PostgreSQL (pool con `pg`). Corriendo local
contra Postgres 18.

- **Auth**: register/login/me con JWT + bcrypt.
- **Autorización**: middleware `requireTripAccess(minRole)` — todo recurso
  bajo un trip valida que el usuario sea `owner` o esté en
  `trip_collaborators` con rol suficiente (`viewer`/`editor`). Desde la
  migración `20260703150000`, un colaborador ya NO puede tener rol
  `owner` — la propiedad la define únicamente `trips.owner_id`.
- **Validación**: `zod` en `src/schemas.ts`, aplicado por ruta con el
  middleware `validateBody` (`src/middleware/validate.ts`) en todo
  POST/PATCH que lo necesita.
- **Recursos implementados**: trips (CRUD), colaboradores, itinerario
  (días + actividades, con reorder para drag&drop), presupuesto (categorías
  + gastos + endpoint de resumen agregado planificado-vs-gastado), hoteles
  y vuelos (con proxy server-side a Amadeus Self-Service para no exponer la
  API key, hoy en pausa por falta de credenciales reales — ver bitácora;
  vuelos además tienen `leg_type` Ida/Vuelta/Interno, escala opcional y
  estimación automática de llegada vía geocoding+distancia), geocoding
  (`services/geocoding.ts`: Google Geocoding API si hay `GOOGLE_MAPS_API_KEY`,
  si no cae a Nominatim/OpenStreetMap sin key), lugares guardados, y un
  endpoint de mapa que agrega actividades + hoteles + lugares con lat/lng
  en una sola llamada.
- **Schema hardening (migraciones `20260703120000`–`20260703170000`,
  ver `migrations/`)**: `updated_at` + trigger en las 7 tablas editables
  que no lo tenían, checks de no-negatividad en toda columna monetaria,
  checks de rango en lat/lng (-90..90 / -180..180) y de formato en
  `currency` (3 letras mayúsculas), tipo `place_category` ENUM compartido
  entre `activities`/`saved_places` (reemplaza el `CHECK` duplicado en
  ambas), índices en `trip_collaborators.user_id` y
  `expenses.paid_by_user_id`. `schema.sql` ya refleja todo esto para
  instalaciones nuevas — las migraciones son para bases existentes.

## Frontend (`trip-planner-app`)

Expo Router. **Expo SDK 54 → React 19.1.0 + React Native 0.81.5**.

- **Auth**: pantallas de login y registro; guard en `app/_layout.tsx` que
  redirige a `/login` si no hay token guardado (se re-chequea en cada
  navegación).
- **Storage del JWT**: `src/utils/tokenStorage.ts` — usa `expo-secure-store`
  en mobile y `localStorage` en web (SecureStore no tiene build web).
- **Navegación**: `src/components/AppHeader.tsx`, compartido por las
  pantallas de `(tabs)` y por el dossier de viaje — logo (vuelve a Inicio),
  links Mis viajes/Reservas/Perfil, avatar con inicial real del usuario, y
  un botón **"← Volver"** que aparece en cualquier pantalla que no sea
  Inicio (calculado por ruta actual, no por un prop manual) y siempre
  navega a Inicio (no al historial).
- **Tabs** (`app/(tabs)/`):
  - `index.tsx` — **Inicio**: carrusel de hasta 3 próximos viajes (tarjeta
    de embarque con cuenta regresiva) + "Estadísticas" del viaje activo del
    carrusel, con barra de progreso para Itinerario/Presupuesto y un mini
    gráfico apilado "Reservas" (Hoteles vs. Vuelos).
  - `trips.tsx` — lista de viajes, botón "+ Nuevo", refetch al volver a foco.
  - `explore.tsx` — **"Reservas"** (antes "Explorar"): carga manual de
    hotel/vuelo contra el trip activo (`selectedTrip` store); la búsqueda
    automática contra Amadeus existe en el backend pero está en pausa sin
    credenciales reales. El form de vuelos tiene selector Ida/Vuelta/Vuelo
    interno, escala opcional (aeropuerto + espera, arriba de la llegada) y
    llegada auto-estimada (editable) para los 3 tipos.
  - `map.tsx` / `map.web.tsx` — mapa con geolocalización; `react-native-maps`
    en mobile, Leaflet vía CDN en web.
  - `budget.tsx` — **ya no es una pantalla real**: toda la gestión de
    presupuesto/gastos se mudó al dossier de cada viaje (ver abajo); este
    archivo quedó como redirect (a `/trip/:id` o a "Mis viajes"). Pendiente
    borrarlo del todo (ver "Pendiente").
  - `profile.tsx` — datos reales del usuario + logout.
- **Detalle de trip** (`app/trip/[tripId]/index.tsx`): dossier con
  pestañas **Itinerario / Presupuesto / Gastos / Hoteles / Vuelos / Mapa**
  (numeración "01, 02..." recalculada según cuáles estén visibles).
  - *Itinerario*: días + actividades (categoría, lugar con geocoding
    automático, hora con `TimePickerField`, costo con `PriceField`
    numérico).
  - *Presupuesto*: categorías planificadas (con barra de progreso y
    borrado), gráfico "Gasto por categoría" (barra apilada a mano), y
    formulario "+ Agregar categoría". NO tiene "Registrar gasto" — eso es
    exclusivo de la pestaña Gastos.
  - *Gastos*: formulario "Registrar/editar gasto" + listado separado en
    "Gastos de la previa" / "Gastos durante el viaje" (derivado comparando
    `expenseDate` contra `startDate` del trip). Disponible en cualquier
    estado del viaje.
  - *Hoteles* / *Vuelos*: listas guardadas, con borrado; Vuelos muestra
    badge Ida/Vuelta/Interno + a qué día del itinerario corresponde.
  - *Mapa*: pines del viaje (actividades/hoteles/lugares con lat/lng).
- **Alta/edición de trip**: `app/new-trip.tsx` y `app/trip/[tripId]/edit.tsx`
  (fuera del grupo `(tabs)`, usan el header nativo default de Expo Router,
  no `AppHeader`).
- **Estado compartido**: `src/store/selectedTrip.ts` (zustand) — qué trip
  está "activo" para pantallas que no reciben `tripId` por la URL (Reservas,
  Mapa/Presupuesto globales... aunque Presupuesto global ya no existe).

## Gotchas de entorno ya resueltos (no re-investigar)

- Windows/Git Bash: `psql`/`createdb` no quedan en PATH aunque Postgres
  esté instalado — agregar `/c/Program Files/PostgreSQL/<version>/bin` a
  `~/.bashrc`. Si el instalador no corre como administrador, la instalación
  queda incompleta (solo aparece la carpeta `data/`, sin `bin/`).
- Si se rearma el proyecto Expo desde cero: usar `npx create-expo-app` o
  correr `npx expo install --fix` + reinstall limpio
  (`rm -rf node_modules package-lock.json && npm install`) para evitar
  mezclas de versiones de React que rompen con "React Element from an
  older version of React was rendered".
- `react-native-maps` es 100% nativo. Un archivo `map.web.tsx` **no alcanza**
  para excluirlo del bundle web (Expo Router bundlea todas las variantes de
  plataforma de una ruta). Hace falta `metro.config.js` con
  `resolver.resolveRequest` devolviendo `{ type: 'empty' }` para
  `react-native-maps` cuando `platform === 'web'`.
- `app.json` con `web.output: "static"` hace pre-render server-side que
  también intenta resolver módulos nativos — con una app autenticada (sin
  necesidad de SEO) conviene `"single"`.
- El sandbox de shell de la sesión de Cowork estuvo caído
  (`HYPERVISOR_VIRT_DISABLED`) durante buena parte del trabajo inicial, así
  que "mover"/"borrar" carpetas se hizo recreando archivos con Write en vez
  de `mv`/`rm`. Esto había dejado basura duplicada (`Web\trip-planner-app` /
  `Web\trip-planner-api` sueltas, de antes de agruparlas en
  `Web\trip-planner\`) — Lautaro las borró manualmente el 2026-07-01, ya no
  hace falta limpiarlas.

## Verificado funcionando end-to-end (2026-07-01)

Login real contra Postgres → lista de viajes → detalle de trip, corriendo
en el navegador (target web de Expo).

## Búsqueda de hoteles/vuelos (2026-07-01)

Implementada de punta a punta, ya no es "pendiente": tab **Explorar**
(`app/(tabs)/explore.tsx`) con toggle Vuelos/Hoteles, formulario (códigos
IATA + fechas ISO, sin geocoding todavía) y tarjetas de resultado con botón
"Guardar en viaje" (usa el trip activo de `selectedTrip` store). Cliente en
`src/api/search.ts` aplana la respuesta anidada de Amadeus. El detalle de
trip (`app/trip/[tripId]/index.tsx`) muestra lo guardado con badge
candidato/reservado. Backend ya tenía el proxy a Amadeus completo.

**Corrección 2026-07-01 (sesión de noche):** la nota de arriba decía
"credenciales reales ya cargadas" — no es así. `trip-planner-api/.env`
tiene `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` **vacíos**, por eso
tanto la búsqueda de vuelos/hoteles como el autocompletado de ciudad
tiran `No se pudo autenticar con Amadeus (status 401)` (ver
`services/amadeus.ts` → `getAccessToken()`, que arma el request de OAuth2
con esas dos variables). No es un bug de código: hace falta cargar
credenciales reales (gratis, sandbox self-service) en
`https://developers.amadeus.com/` → crear una app → copiar API Key/API
Secret a `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET` en el `.env`, y
reiniciar `npm run dev` del backend. Sin esto, cualquier pantalla que
dependa de Amadeus (Explorar completo, incluido el desplegable de
ciudades/aeropuertos) va a fallar en silencio o con este mismo 401.

De paso: `LocationField` en `explore.tsx` antes se tragaba cualquier
error de `searchLocations()` en silencio (`.catch(() => setSuggestions([]))`
sin mostrar nada), así que un 401 de Amadeus se veía como "el
desplegable nunca aparece" sin ninguna pista de por qué. Ahora muestra el
mismo mensaje de error que ya usaba la búsqueda de vuelos/hoteles.

## "Explorar" reemplazado por carga manual (2026-07-01, sesión de noche)

A pedido de Lautaro, mientras no haya credenciales reales de Amadeus se
dejó de lado la búsqueda y se reemplazó por carga manual:

- `app/(tabs)/explore.tsx` se reescribió por completo: ya no busca contra
  Amadeus (`searchHotels`/`searchFlights`/`searchLocations` de
  `src/api/search.ts`, que quedó **sin usar pero intacto** — tiene un
  comentario "EN PAUSA" arriba explicando cómo reengancharlo cuando haya
  credenciales). Ahora es un formulario (toggle Vuelos/Hoteles) para
  cargar a mano nombre/fechas/precio/notas y guardarlo contra el trip
  activo del store `selectedTrip`.
- Nuevas funciones `createHotel`/`createFlight` en `src/api/trips.ts` —
  pegan contra los MISMOS endpoints que ya usaba el guardado de
  resultados de Amadeus (`POST /trips/:tripId/hotels` y `/flights`, sin
  cambios de backend), solo que con `bookingSource: 'manual'` en vez de
  `'amadeus'`. Esos endpoints nunca dependieron de Amadeus — solo
  insertan filas — así que no hizo falta tocar nada del backend.
- Vuelos: como no hay date+time picker propio, la fecha usa
  `DatePickerField` (igual que el resto de la app) y la hora un
  `TextInput` de texto libre tipo "22:40" (mismo patrón que "Agregar
  actividad" en el dossier de viaje) — se combinan en JS en
  `toDatetime()` antes de mandar al backend.
- El link de navegación en `AppHeader` que decía "Explorar" ahora dice
  "Reservas" (más preciso para carga manual). La ruta no cambió
  (`/(tabs)/explore`) para no romper los botones "+ Agregar reserva" /
  "+ Agregar vuelo" del dossier de viaje, que ya apuntaban ahí.
- Pendiente para cuando haya credenciales de Amadeus: decidir si
  "Reservas" vuelve a ser búsqueda automática, o si conviven las dos
  cosas (buscar y también poder cargar a mano) — por ahora es solo carga
  manual.

Fix 2026-07-01: el precio de hotel que devuelve Amadeus (`price.total` en
`/v3/shopping/hotel-offers`) es el total de **toda la estadía**, no una
tarifa por noche — la tarjeta decía "/ noche" y era incorrecto. Ahora
`searchHotels()` calcula `nights` a partir de check-in/check-out y la
tarjeta muestra el total real más el precio por noche calculado como dato
secundario.

## Mapa con pines reales (2026-07-01)

`map.tsx` (mobile) ya no solo centra en la ubicación del usuario: con un
trip activo (`selectedTrip` store) centra en `destinationLat/Lng` y pinta
markers de `/trips/:tripId/map` (actividades, hoteles, lugares guardados),
coloreados por tipo. Sin trip seleccionado cae al comportamiento anterior
(ubicación del usuario). `map.web.tsx` no tiene `react-native-maps`, así que
en vez del placeholder estático ahora muestra los mismos pines como lista
(título, tipo, lat/lng) — no es un mapa visual todavía, pero ya no es data
muerta. Ambos usan `theme.ts`.

## Autocompletado de ciudad/aeropuerto (2026-07-01)

Nuevo endpoint `/locations/search` (proxy a Amadeus Location Search,
`services/amadeus.ts` → `searchLocations()`), consumido desde
`src/api/search.ts` (`searchLocations()`). En `explore.tsx`, los campos de
ciudad/origen/destino son ahora un componente `LocationField` con dropdown
de sugerencias (debounce 350ms, sin librerías nuevas): al elegir una
sugerencia se manda el código IATA real; si el usuario tipea directo un
código sin elegir nada, se sigue usando el texto en mayúsculas como
fallback (compatibilidad con el comportamiento anterior). También se
agregó validación de formato de fecha (regex AAAA-MM-DD + check-out >
check-in) antes de disparar la búsqueda.

## Date picker propio (2026-07-01)

`src/components/DatePickerField.tsx`: selector de fecha con calendario
(modal + grilla armada a mano con `Date`, sin librerías nuevas — se decidió
así en vez de `@react-native-community/datetimepicker` porque el sandbox de
esta sesión no podía correr `npm install` para validar una dependencia
nativa). Se usa en dos lugares:

- `explore.tsx` (búsqueda de hoteles/vuelos): check-in/check-out/fecha de
  salida, con `minDate` = hoy (no se puede buscar para el pasado) y, en
  check-out, el check-in elegido.
- `new-trip.tsx` (alta de trip): fecha de inicio/fin, sin restringir el
  inicio a "hoy en adelante" (a diferencia de la búsqueda, acá se puede
  cargar un viaje ya hecho) pero con `minDate` en el campo de fin = fecha
  de inicio elegida. De paso `new-trip.tsx` pasó a usar `theme.ts` en vez de
  colores sueltos (era la última pantalla sin migrar).

## Mapa visual real para web (2026-07-01)

`map.web.tsx` dejó de ser una lista: ahora es un mapa Leaflet real. En vez
de agregar `leaflet`/`react-leaflet` a `package.json` (no se podía correr
`npm install` para validarlos en esta sesión), se cargan `leaflet.js` y
`leaflet.css` desde el CDN de unpkg en tiempo de ejecución (`loadLeaflet()`,
memoizado a nivel módulo para no reinyectar los `<script>`/`<link>` al
volver a la pestaña). El contenedor es un `<View>` de react-native-web cuyo
`ref` reenvía al `<div>` real, que es lo que recibe Leaflet.

Centra en `destinationLat/Lng` del trip si está geocodificado, pinta
markers coloreados por tipo (actividad/hotel/lugar) desde
`/trips/:tripId/map`, hace `fitBounds` a los pines, y llama
`invalidateSize()` al reenfocar la pestaña (Leaflet mide mal si se
inicializó con la pestaña oculta). Tiles de OpenStreetMap (gratis, sin API
key). El código nativo (`map.tsx`, react-native-maps) no se tocó.

Si en algún momento se puede instalar paquetes, considerar migrar a
`react-native-web-maps` o `react-leaflet` para no depender de un CDN
externo — queda anotado en un comentario arriba de `loadLeaflet()`.

## Rediseño de Stitch extendido a toda la app (2026-07-01)

`trips.tsx` y `profile.tsx` eran las últimas pantallas con estilos sueltos;
ahora usan `theme.ts` como el resto (Inicio, Explorar, Mapa, Presupuesto,
detalle de trip). De paso, `profile.tsx` pasó de ser solo un botón de
logout a mostrar los datos reales del usuario (nombre, email, avatar con
inicial) vía `GET /auth/me`, que ya existía en el backend pero no se
consumía desde el cliente (nuevo `getMe()` en `src/api/auth.ts`).

## Fixes de bugs reportados por Lautaro (2026-07-01, sesión de tarde)

- **Header/back invisible en rutas fuera de las tabs**: `app/_layout.tsx`
  tenía `headerShown: false` en el `screenOptions` del Stack raíz — eso se
  hereda a TODAS las rutas hijas, incluidas `trip/[tripId]` y `new-trip`
  (expo-router las registra solo, aunque no tengan `<Stack.Screen>` acá).
  Resultado: una vez adentro de un trip (desde "Mis viajes" o desde el
  Panel de Control) no había header ni botón de volver — pantalla sin
  salida. Fix: `headerShown: false` ahora solo en `(auth)` y `(tabs)`
  (que dibujan su propio header/tabs), el resto usa el default (header +
  back).
- **"Agregar actividad" no dejaba crear nada**: `app/trip/[tripId]/index.tsx`
  era de solo lectura — mostraba el itinerario pero no tenía ningún form
  para cargar día/actividad, aunque el backend ya soportaba
  `POST /trips/:tripId/days` y `POST /days/:dayId/activities`. Se agregó un
  form "Agregar actividad" (selector de día vía chips + "+ Agregar día
  nuevo" con `DatePickerField`, chips de categoría, título/lugar/hora/costo)
  usando `createDay`/`createActivity` nuevas en `src/api/trips.ts`.
- **Bug de mapeo descubierto de paso**: `getTripDays` devolvía las filas
  crudas de Postgres (snake_case: `day_number`, `location_name`,
  `start_time`, `estimated_cost`, etc.) sin mapear a camelCase — a
  diferencia de `mapTrip`, no había `mapDay`/`mapActivity`. No se notaba
  porque hasta ahora nunca había días cargados (pantalla vacía). Se agregó
  el mapeo; si no se hubiera hecho, el form nuevo hubiera mostrado "Día
  undefined" en los chips.
- **"Agregar actividad" del Panel de Control siempre iba a Bariloche**: el
  cálculo de "próximo viaje" en `index.tsx` hacía `future[0] ?? trips[0]`
  — con todos los viajes de prueba en el pasado, `future` quedaba vacío
  siempre y caía en `trips[0]` (el primero cargado en la base, sin importar
  cuántos viajes hubiera). Se resolvió junto con el pedido de mostrar los
  próximos 3 viajes: ver ítem siguiente.
- **Home: carrusel de próximos 3 viajes**: el hero de `index.tsx` pasó de
  mostrar un solo viaje a un `ScrollView` horizontal con paging (hasta 3
  viajes futuros más cercanos; si no hay ninguno futuro, los 3 pasados más
  recientes en vez de un fallback arbitrario) + dots de posición. Las
  acciones rápidas ("Agregar actividad") ahora apuntan al viaje activo del
  carrusel (`activeTrip`), no a un cálculo fijo.
- **Dropdown de ciudades (hoteles/vuelos) no registraba la selección**:
  causa raíz clásica de RN — el `LocationField` con sus sugerencias vive
  dentro de un `ScrollView` (`explore.tsx`) sin
  `keyboardShouldPersistTaps`; con el teclado abierto (TextInput
  enfocado), el primer toque sobre una sugerencia lo absorbía el
  ScrollView para cerrar el teclado en vez de dispararle el `onPress` al
  item. Fix: `keyboardShouldPersistTaps="handled"` en el ScrollView de
  Explorar (y de paso en el de detalle de trip, que ahora también tiene
  TextInputs).

## Rediseño visual "Rumbo" (2026-07-01, sesión de tarde/noche)

Lautaro pasó un `index.html` (boceto estático) como referencia de un nuevo
look completamente distinto al rediseño Stitch "Smart Travel Planner"
anterior: identidad "dossier de viaje editorial" — papel cálido (#F3EFE6),
tinta navy (#16233D), sello naranja de acento (#E7552F), teal (#2C7A6B),
tipografías Space Grotesk/Inter/Space Mono, tarjeta de embarque con stub
punteado, timeline con pines, etc. Se migró **toda la app**:

- `src/theme.ts` reescrito con la paleta nueva. Se mantuvieron los mismos
  nombres de export (`colors`, `spacing`, `radius`, `cardShadow`) para no
  tener que tocar el acceso a estilos de cada pantalla — solo cambiaron los
  valores — y se sumaron tokens nuevos sin equivalente anterior: `fonts`
  (display/displaySemibold/body/mono) y `tracking` (normal/wide/eyebrow).
- **Fuentes**: el boceto pide Space Grotesk/Inter/Space Mono (Google
  Fonts), que en Expo requieren paquetes `@expo-google-fonts` + `expo-font`
  (necesitan `npm install`, que esta sesión de sandbox no podía correr).
  Se arrancó con fuentes del sistema como aproximación (`fonts.mono` usa la
  monospace nativa, que ya se ve bien). Pendiente cuando se pueda instalar:
  ```
  npx expo install expo-font @expo-google-fonts/space-grotesk @expo-google-fonts/space-mono @expo-google-fonts/inter
  ```
  y reemplazar los strings de `fonts` en `theme.ts` por los nombres reales
  (`SpaceGrotesk_700Bold`, etc.), cargándolos con `useFonts()` en
  `app/_layout.tsx` antes de renderizar.
- **Pantallas rediseñadas**: Inicio (hero pasó de tarjeta con imagen de
  fondo a "tarjeta de embarque" — main + stub punteado con cuenta
  regresiva, con las muescas de perforación del boceto), Mis viajes
  (tarjetas tipo ficha), Detalle de viaje/Itinerario (día con insignia
  numerada, timeline con nodos de sello naranja, vuelos guardados con
  tarjeta boarding-pass), Presupuesto (categorías con barra + tarjeta total
  oscura con barra de progreso, como el boceto), Explorar (hoteles con
  bloque de color + insignia de ciudad en vez de foto real — Amadeus no
  siempre trae imagen en este plan —, vuelos con tarjeta boarding-pass),
  Mapa (pines recoloreados: teal actividades, sello hoteles, dorado
  lugares), Perfil, Login/Registro (no se habían migrado nunca al rediseño
  anterior, seguían con azul Material hardcodeado) y tabs/header nativo
  (`app/(tabs)/_layout.tsx`, `app/_layout.tsx` con header tinta navy).
- **Sin dependencias nuevas**: todo hecho con `View`/`StyleSheet` — sin
  `react-native-svg` ni gradientes (no estaban instaladas y no se podía
  correr `npm install`), así que el "anillo de progreso" del boceto se
  simplificó a una insignia circular con porcentaje en vez de un
  conic-gradient real, y los bloques de imagen de hotel son color sólido
  en vez de gradiente diagonal.
- No se tocó la lógica de datos de ninguna pantalla, solo estilos/JSX de
  presentación.

## Dossier de viaje con pestañas (2026-07-01, sesión de noche)

Lautaro pidió que el detalle de viaje (`app/trip/[tripId]/index.tsx`) fuera
"idéntico" al boceto: pestañas en el header + un selector debajo del
boleto con toda la información (no la lista plana que había hasta ahora).

- **Header propio** (al principio vivía como función local en este mismo
  archivo; después se extrajo a `src/components/AppHeader.tsx` — ver
  sección de más abajo): reemplaza el header nativo
  (`<Stack.Screen options={{ headerShown: false }} />`) por uno a medida
  con wordmark "ViajaYa.", links de navegación, y avatar — igual al
  boceto. Se agregó un botón de volver (‹) explícito porque el header
  nativo era el único lugar de donde salía el back (mismo bug de "no
  puedo salir" que ya se había arreglado una vez para el Stack raíz — no
  reintroducirlo).
- **Hero + tarjeta de embarque**: eyebrow/título/subtítulo + botones
  Compartir (`Share.share` nativo, sin dependencia nueva) y "Editar viaje".
  El stub de la tarjeta de embarque ahora tiene una insignia de progreso
  con un **porcentaje real** (promedio de: ¿hay actividades cargadas en
  cada día del itinerario?, ¿hay hoteles guardados?, ¿hay vuelos
  guardados?, ¿hay categorías de presupuesto?) en vez de un número fijo.
- **Selector de pestañas 01-05** debajo del boleto (Itinerario/Presupuesto/
  Hoteles/Vuelos/Mapa), con `activeTab` + paneles condicionales:
  - *Itinerario*: el timeline + form "Agregar actividad" que ya existía.
  - *Presupuesto*: NUEVO panel embebido — reutiliza `getBudgetSummary`/
    `createBudgetCategory`/`createExpense` y, para no duplicar estilos,
    `CATEGORY_COLORS`/`categoryGlyph` ahora se exportan desde
    `app/(tabs)/budget.tsx` (antes eran privados del archivo) e se
    importan acá con ruta relativa (`../../(tabs)/budget`) — el alias
    `@/*` solo cubre `src/*`, no `app/`.
  - *Hoteles* / *Vuelos*: las listas que ya existían, más un botón
    "+ Agregar reserva/vuelo" que navega a Explorar.
  - *Mapa*: NUEVO panel — usa `getTripMapPins` + los componentes nuevos
    `src/components/TripMapPreview.tsx` (nativo, `react-native-maps`) y
    `TripMapPreview.web.tsx` (Leaflet vía CDN, mismo patrón que
    `map.web.tsx` pero acotado a los pines de un trip por props). No
    hizo falta tocar `metro.config.js`: esa intercepción de
    `react-native-maps` en web solo es necesaria para archivos de ruta de
    Expo Router, no para un componente común con sufijo `.web.tsx`.
- **Modal "Editar viaje"** nuevo: `app/trip/[tripId]/edit.tsx`, mismo
  patrón que `new-trip.tsx` pero precargado con los datos del trip y
  llamando a `updateTrip` (agregado a `src/api/trips.ts`, pega contra
  `PATCH /trips/:tripId` que el backend ya soportaba pero el cliente
  nunca usaba).
- **Carga de datos**: se cambió de `useEffect` a `useFocusEffect` en el
  detalle de viaje, para que al volver de "Editar viaje" o de guardar un
  hotel/vuelo en Explorar, el dossier se refresque solo sin tocar nada.
- Sin dependencias nuevas otra vez (mismo motivo: no se puede correr
  `npm install` en esta sesión) — el anillo de progreso sigue siendo una
  insignia circular simple, no un arco conic-gradient real.

## Navegación: de tab bar abajo a header arriba (2026-07-01, sesión de noche)

Lautaro pidió que la navegación principal de la app pasara de tabs abajo a
"seleccionables arriba" (como el header del dossier), y que quedaran
únicamente Mis viajes / Explorar / Perfil.

- **`src/components/AppHeader.tsx`** (nuevo, compartido): logo "ViajaYa."
  (toca y vuelve a Inicio), los 3 links, y avatar con la inicial real del
  usuario (`getMe()`) en vez del "L" hardcodeado que tenía el header viejo
  del dossier. Prop `showBack` opcional para dibujar el botón ‹ (lo usa
  el dossier de viaje; las 6 pantallas de `(tabs)` no lo necesitan, son
  destinos "planos"). Los links y el logo navegan con `router.replace`
  (no `push`) para que moverse entre ellos no acumule historial de vuelta
  atrás — se siente como tabs aunque ahora es un Stack.
- **`app/(tabs)/_layout.tsx`**: pasó de `Tabs` (con tab bar abajo) a
  `Stack` con `screenOptions.header` apuntando a este `AppHeader` — ya no
  hay tab bar. Las 6 pantallas (`index`, `trips`, `explore`, `map`,
  `budget`, `profile`) siguen existiendo como rutas del grupo, pero solo
  Mis viajes/Explorar/Perfil tienen link visible; Presupuesto y Mapa
  dejaron de ser destinos de primer nivel (ya viven como pestañas del
  dossier de cada viaje) pero sus pantallas globales se dejaron intactas
  y alcanzables por links puntuales que ya existían (ej. "Ver
  presupuesto" en Inicio, "Ver en Presupuesto →" desde el dossier).
- **`app/(tabs)/index.tsx`** (Inicio): se le sacó su propio TopAppBar
  (hamburguesa + logo + avatar) porque ahora lo cubre el `AppHeader`
  compartido del layout.
- **`app/trip/[tripId]/index.tsx`**: el `AppHeader` local que se había
  escrito para el dossier (sección de arriba) se reemplazó por este
  mismo componente compartido, con `showBack` en `true` y sin el link de
  Presupuesto duplicado.
- **`app/(tabs)/trips.tsx`**: el botón "+ Nuevo" vivía en `headerRight`
  del `Stack.Screen` nativo — con un `header` a medida ese slot ya no se
  dibuja, así que se movió a un renglón propio arriba de la lista
  ("MIS VIAJES" + botón), dentro del cuerpo de la pantalla.
- Pendiente/aviso: la pantalla global `/(tabs)/map` (distinta del tab
  Mapa del dossier — esa usa el trip seleccionado del store, no un trip
  puntual) quedó sin ningún link visible que la abra; no se tocó ni se
  borró, solo dejó de estar en la navegación principal. Si en algún
  momento no hace falta más, se puede borrar `map.tsx`/`map.web.tsx` del
  grupo `(tabs)` (el mapa del dossier es independiente y no depende de
  esos archivos).

## Reservas: selectores de campo + lat/lng manual en actividades/hoteles (2026-07-01)

Cuatro campos de `explore.tsx` ("Reservas") pasaron de texto libre a
componentes dedicados, todos con split nativo/web y sin librerías nuevas:
`SelectField` (modal en nativo, `<select>` real en web) para Moneda y
Aerolínea, con datos fijos en `src/data/currencies.ts`/`airlines.ts`;
`TimePickerField` (columnas HH/MM en nativo, `<input type="time">` en web)
para hora de salida/llegada; `PriceField` (un solo archivo, sin split) con
separador de miles en vivo (`es-AR`, coma decimal) para Precio. Ojo con
`PriceField`: el punto SIEMPRE se descarta como separador de miles al
sanitizar la entrada — si se lo llega a tratar como alias de la coma
decimal, el propio "1.000" que el componente formatea se relee como
decimal y el campo se "traba" a partir del tercer dígito.

Aparte, `departureAirport`/`arrivalAirport` tienen `maxLength={10}` (columna
`VARCHAR(10)` en `schema.sql`, pensada para código IATA) — sin el límite,
tipear el nombre de una ciudad larga tira `value too long for type
character varying(10)` desde Postgres tal cual (el error handler global de
`app.ts` reenvía `err.message` crudo al cliente).

También se resolvió por qué la pestaña Mapa quedaba vacía con datos reales
cargados: `GET /trips/:tripId/map` filtra `WHERE lat IS NOT NULL AND lng
IS NOT NULL`, y ninguna pantalla mandaba esas columnas — ni el form de
"+ Agregar actividad" (dossier) ni el de hotel (`explore.tsx`) las pedían.
Primer intento: agregar inputs manuales de Latitud/Longitud a esos forms.
A Lautaro no le gustó el flujo de copiar coordenadas de Google Maps a mano,
así que se reemplazó por geocoding automático server-side en
`trip-planner-api/src/services/geocoding.ts`, llamado desde
`activities.routes.ts` (POST `/days/:dayId/activities`) y
`hotels.routes.ts` (POST `/trips/:tripId/hotels`) cuando no llegan
`lat`/`lng` explícitos en el body — geocodifican `locationName`/`address`
(+ `destination` del trip, para desambiguar: "Pumamarca, Salta" en vez de
"Pumamarca" a secas).

Primera versión: solo Nominatim (OpenStreetMap), sin API key. Con
"Hotel Central" (nombre + dirección reales) devolviendo `null` igual, sin
poder diagnosticar nada porque el error quedaba tragado en el `catch` —
se agregó `console.warn` en cada rama de fallo (HTTP no-ok, 0 resultados,
excepción de red) para poder ver en la terminal de `npm run dev` qué está
pasando. A pedido de Lautaro ("vamos a probar con API de Google") se sumó
Google Geocoding API como opción principal: `geocodeWithGoogle()` pega a
`maps.googleapis.com/maps/api/geocode/json` con `GOOGLE_MAPS_API_KEY` (ver
`.env.example` — hay que habilitar "Geocoding API" en Google Cloud
Console). `geocode()` prueba Google primero y si no hay key cargada (o
Google no encuentra nada) cae a `geocodeWithNominatim()` como antes — así
el feature sigue andando aunque la key de Google todavía no esté puesta.
Ninguna de las dos bloquea el guardado si falla: la actividad/hotel se
guarda igual sin coordenadas.

## Eliminar actividades/hoteles/vuelos/categorías (2026-07-02)

El backend ya tenía `DELETE /activities/:id`, `/hotels/:id`, `/flights/:id`
y `/budget-categories/:id` desde el principio — nunca estuvieron expuestos
en el cliente. Se agregaron las funciones correspondientes en
`src/api/trips.ts`/`src/api/budget.ts` y un componente genérico
`src/components/ConfirmDeleteModal.tsx` (mismo look que el modal de
"Eliminar viaje" del dossier, reusado en vez de duplicado) con botones
"✕"/"Eliminar" en cada card/fila. Borrar una categoría no borra los gastos
ya cargados con ella — `budget_categories` tiene `ON DELETE SET NULL` en
`expenses.budget_category_id` (ver `schema.sql`), así que solo quedan sin
categoría asignada.

## Pestaña de Presupuesto: lista de gastos, filtros, gráfico (2026-07-02)

Hasta acá los gastos individuales eran invisibles una vez cargados — el
único feedback era el agregado por categoría (`getBudgetSummary`). Se
agregó a `app/(tabs)/budget.tsx`:

- **Lista de gastos** con editar/eliminar, vía `getExpenses`/`updateExpense`/
  `deleteExpense` nuevos en `src/api/budget.ts` (el backend ya soportaba
  filtros `category`/`from`/`to` en `GET /trips/:tripId/expenses`, sin usar
  desde el cliente). Editar reutiliza el mismo form de "Registrar gasto"
  (cambia a "Actualizar gasto" cuando `editingExpenseId` no es null).
- **Filtros** por categoría (`SelectField`) y rango de fechas
  (`DatePickerField` x2) — se disparan solos con un `useEffect` sobre los 3
  filtros, no hace falta un botón "Buscar".
- **Orden** por fecha reciente o mayor monto — ordenado client-side
  (`useMemo`), sin cambios en el backend.
- **Gráfico "Gasto por categoría"**: barra horizontal apilada a mano
  (`flex: spent` por segmento, sin cálculo de porcentajes) en vez de un
  donut/torta real — mismo motivo que `ProgressBadge` en el dossier: sin
  `react-native-svg` instalado no hay forma de dibujar arcos. Incluye un
  segmento "Sin categoría" cuando `totalSpent` no cierra con la suma de
  categorías (gastos sin `budget_category_id`).
- **Fix de moneda**: "Registrar gasto" nunca mandaba `currency`, así que el
  backend caía siempre en su default fijo `'USD'` sin importar la moneda
  del viaje. Corregido en `createExpense` (ahora manda
  `selectedTrip.currency`/`trip.currency`) tanto en `budget.tsx` como en el
  mini-form de Presupuesto embebido en el dossier (`app/trip/[tripId]/index.tsx`).
- **Fix de backend**: `PATCH /expenses/:id` usaba `COALESCE($n, columna)`
  para los 4 campos editables, lo que hacía imposible "limpiar"
  `budget_category_id` a `NULL` (pg convierte `undefined` en `NULL` al
  bindear, y `COALESCE(NULL, columna)` devuelve la columna sin tocar).
  Reescrito con el mismo patrón de `activities.routes.ts` (SET dinámico
  según qué claves llegaron en el body) para que `budgetCategoryId: null`
  explícito sí limpie el campo.

El panel de Presupuesto embebido en el dossier (`app/trip/[tripId]/index.tsx`)
se quedó con la vista resumida (categorías + total) — a pedido de Lautaro
("no quiero que se vea Agregar Categoría/Registrar Gasto ahí") se sacaron
del todo los dos forms que tenía duplicados (con `TextInput` crudos, sin
`PriceField`/`DatePickerField`/`SelectField` ni el fix de moneda) y se
reemplazaron por un botón "+ Agregar categoría o registrar gasto en
Presupuesto →" que lleva a la pantalla completa (`handleGoToBudgetTab`, ya
existía). De paso se sacó el tap-to-select en las tarjetas de categoría
(`selectedCategoryId` solo servía para preseleccionar categoría en el form
de gasto que ya no está acá) — el botón "✕" de borrar sigue igual.

## Vuelos: Ida/Vuelta/interno, escala y llegada auto-estimada (2026-07-02)

Rediseño grande del form de Vuelos en `explore.tsx` (Reservas), a pedido de
Lautaro. Requiere correr **`migration_flights_legs.sql`** contra la base
existente (`psql trip_planner -f migration_flights_legs.sql`) — agrega a
`flights`: `leg_type` (`departure`|`return`|`one_way`, default `one_way`),
`has_layover`, `layover_airport`, `layover_duration_minutes`. `schema.sql`
ya tiene estas columnas para instalaciones nuevas.

- **Tipo de vuelo**: 3 chips (Ida / Vuelta / Vuelo interno) arriba del
  form. Cada guardado es UN flight con `leg_type` — no hay un "grupo"
  ida+vuelta en la base, cada tramo se carga y borra por separado (decisión
  explícita: más simple que un form único con los dos tramos juntos).
  Botón "⇄" para invertir origen/destino al armar la vuelta.
- **Escala**: checkbox "Con escala" que revela aeropuerto de la escala +
  horas/minutos de espera. Es un dato informativo del vuelo (no un segundo
  segmento de vuelo modelado aparte).
- **Llegada auto-estimada**: para los 3 tipos de vuelo (Ida, Vuelta y Vuelo
  interno) el form NO pide fecha/hora de llegada por default — se calcula
  sola apenas hay origen+destino+salida completos (debounce 600ms), vía
  `GET /flights/estimate-arrival` → `trip-planner-api/src/services/flightEstimate.ts`.
  **Importante**: es una estimación GRUESA (geocodifica "<code> airport"
  con el mismo `geocode()` de Google/Nominatim ya integrado, Haversine +
  800km/h de crucero + 45min de margen) — NO el horario real del vuelo, no
  tiene en cuenta rutas reales, viento, ni husos horarios. El usuario puede
  tocar "Ingresar llegada manualmente" (`manualArrival`) para desactivarla y
  cargar los campos a mano en cualquiera de los 3 tipos; ahí aparece
  "✨ Calcular automáticamente" para rellenarlos con la misma estimación y
  seguir editando.
  - *Corrección 2026-07-02*: la primera versión solo auto-calculaba para
    "Vuelo interno" y mostraba Fecha/Hora de llegada como campos obligatorios
    para Ida/Vuelta (con el botón de auto-cálculo como mero atajo) —
    confundía, porque el form decía "se calcula automáticamente" pero igual
    pedía completar la llegada a mano. Unificado: `showArrivalFields` ahora
    depende solo de `manualArrival`, sin importar `legType`.
  - *Ajuste 2026-07-02 (2)*: el checkbox "Con escala" se movió arriba de la
    Fecha/Hora de salida... de llegada (antes estaba después de
    Aerolínea/N° de vuelo, o sea DESPUÉS de la estimación — el tiempo de
    espera se cargaba tarde para influir en el cálculo). Además, el tiempo
    de espera ahora se suma a la duración estimada: `estimateArrival()` en
    `flightEstimate.ts` toma un 4to parámetro `layoverMinutes` (default 0) y
    lo suma a `durationMinutes`; `GET /flights/estimate-arrival` lo lee como
    query param opcional; `estimateFlightArrival()` en `src/api/trips.ts` y
    ambos call-sites en `explore.tsx` (el `useEffect` con debounce y
    `handleEstimateArrivalClick`) lo pasan a partir de un helper
    `getLayoverMinutesTotal()`.
- **Vista en el dossier** (`app/trip/[tripId]/index.tsx`, tab Vuelos): cada
  card muestra un badge Ida/Vuelta/Interno, a qué "Día N" del itinerario
  corresponde (match por fecha contra `days`, solo si ese día ya existe), y
  la info de escala si tiene.

## Pestaña "Gastos" en el dossier, condicional por estado (2026-07-02)

A pedido de Lautaro: nueva pestaña "Gastos" en `app/trip/[tripId]/index.tsx`,
separada de "Presupuesto", que solo aparece cuando `trip.status` es
`confirmed` o `ongoing` (antes de confirmar el viaje no hay gastos reales
que registrar, solo presupuesto planificado). No se tocó backend ni
`schema.sql` — reutiliza 100% los endpoints/funciones de gastos que ya
existían para la pantalla global de Presupuesto (`getExpenses`,
`createExpense`, `updateExpense`, `deleteExpense` en `src/api/budget.ts`).

- **Pestañas dinámicas**: `TABS` pasó a ser `BASE_TABS` (sin número fijo) +
  un `tabs` calculado en el componente que renumera ("01", "02"...) para
  que nunca salte un número.
  - *Corrección 2026-07-02 (2)*: originalmente `tabs` filtraba `'expenses'`
    según `showExpensesTab = trip.status === 'confirmed' || trip.status === 'ongoing'`
    (primer lugar de la app donde el estado del viaje condicionaba qué se
    renderizaba) — a pedido de Lautaro esa condición se sacó: la pestaña
    Gastos ahora está disponible en cualquier estado, para poder cargar
    gastos de la previa desde que arranca la planificación. `showExpensesTab`
    se eliminó del código.
- **Contenido de la pestaña**: a diferencia del panel de Presupuesto (que
  desde el 2026-07-02 anterior NO tiene formularios, solo un CTA a la
  pantalla global), acá SÍ hay un formulario "Registrar/Editar gasto"
  completo (categoría opcional, descripción, monto, fecha) directo en el
  dossier — la idea es poder ir sumando gastos reales en el momento, sin
  saltar de pantalla.
- **"Gastos de la previa" / "Gastos durante el viaje"**: separación
  puramente derivada en el frontend (no hay campo en el modelo de datos
  para esto) comparando `expense.expenseDate` contra `trip.startDate` — todo
  lo anterior al primer día es "previa", desde el primer día en adelante
  (incluye el regreso) es "durante". Cada sección muestra su lista y un
  subtotal.
- **Editar/eliminar gasto**: mismo patrón que el resto del dossier —
  `DeleteTarget`/`DELETE_COPY` genérico (ahora con el caso `'expense'`) +
  `ConfirmDeleteModal`; editar reusa el mismo formulario (`editingExpenseId`).
- Los gastos se cargan junto con el resto del dossier en `load()`
  (`getExpenses(tripId)`, sin filtros) — no hay fetch separado por pestaña.

## Presupuesto: se eliminó la pantalla global, todo vive en el dossier (2026-07-02)

A pedido de Lautaro: la pantalla global `/(tabs)/budget` (categorías,
gráfico "Gasto por categoría", "Agregar categoría") se mudó ENTERA a la
pestaña Presupuesto del dossier, que hasta ahora solo tenía la lista de
categorías + total (sin formularios, con un CTA a la pantalla global). La
pestaña Gastos (ver sección anterior) quedó tal cual estaba — decisión
explícita: "Registrar gasto" sigue siendo exclusivo de Gastos, Presupuesto
es solo categorías planificadas + gráfico + alta de categoría.

- `CATEGORY_COLORS` y `categoryGlyph()` se movieron de `budget.tsx` a
  `src/utils/budgetDisplay.ts` (módulo neutral, sin pantalla dueña) para que
  el dossier no dependiera de un archivo de pantalla.
- El dossier ganó: form "+ Agregar categoría" (`createBudgetCategory`,
  ya existía en `src/api/budget.ts`, sin usar desde ahí) y el gráfico de
  barra apilada `chartSegments` (misma lógica que tenía `budget.tsx`).
- Se sacó el botón "Ver en Presupuesto →" del header del panel y el CTA
  "+ Agregar categoría o registrar gasto en Presupuesto →" de abajo. En su
  lugar, si `showExpensesTab` es true hay un link que cambia a la pestaña
  Gastos ("Para registrar un gasto real, andá a la pestaña Gastos →"); si
  el viaje todavía no está Confirmado/En curso, un texto explica que eso se
  habilita al confirmar.
- **`app/(tabs)/budget.tsx` NO se pudo borrar**: esta sesión no tuvo acceso
  a shell (`mcp__workspace__bash` — "Workspace unavailable...
  HYPERVISOR_VIRT_DISABLED" toda la conversación), así que el archivo se
  reemplazó por un simple redirect (a `/trip/:id` del `selectedTrip`, o a
  "Mis viajes" si no hay ninguno seleccionado) en vez de quedar eliminado.
  Pendiente: borrar `trip-planner-app/app/(tabs)/budget.tsx` a mano y sacar
  `<Stack.Screen name="budget" />` de `app/(tabs)/_layout.tsx` — ya no hace
  falta ninguna de las dos cosas, es solo prolijidad.

## Estadísticas del Home con gráficos (2026-07-02)

A pedido de Lautaro ("quiero que tenga más información gráfica"), la
sección "Estadísticas" de Inicio (`app/(tabs)/index.tsx`) pasó de 4 números
pelados (Itinerario, Presupuesto, Hoteles, Vuelos) a:

- **Itinerario** y **Presupuesto**: barra de progreso (`statTrack`/
  `statTrackFill`, mismo patrón `track`/`trackFill` que ya usa el dossier
  para categorías de presupuesto) debajo del valor. Presupuesto se pinta
  con `colors.stamp` (naranja/alerta) si `totalSpent > totalPlanned`, con
  `colors.gold` si no.
- **Reservas** (nueva fila, reemplaza los StatBlock sueltos de Hoteles/
  Vuelos): mini barra apilada (`flex: hotelsCount` / `flex: flightsCount`)
  + leyenda con glyph, color y conteo de cada uno.

Sin dependencias nuevas (no hay `react-native-svg`): todo con `View` +
`flex`/`width%`, igual que el resto de los gráficos "a mano" de la app.

## AppHeader: botón "← Volver" global a Inicio (2026-07-02)

A pedido de Lautaro ("quiero que todas las pestañas tengan un botón
'← Volver' con vuelta atrás al inicio"). Antes `AppHeader` tenía un prop
`showBack` opcional que solo pasaba el dossier de viaje, dibujando un
simple glyph "‹" que hacía `router.back()` (volvía a lo que hubiera antes
en el historial, no siempre Inicio).

- `AppHeader` ya no recibe `showBack` — calcula solo `isHome` a partir de
  `usePathname()` (`pathname === '/'`) y muestra el botón en cualquier
  pantalla que no sea Inicio.
- El botón ahora es texto "← Volver" (antes un glyph de 26px), y siempre
  hace `router.replace('/(tabs)')` — igual que tocar el logo — en vez de
  depender del historial de navegación.
- Cubre automáticamente las 6 pantallas de `(tabs)` y el dossier de viaje
  (todas comparten `AppHeader`). **NO** cubre `new-trip.tsx` ni
  `trip/[tripId]/edit.tsx`: esas dos quedan fuera del grupo `(tabs)` y usan
  el header nativo default del Stack raíz (`app/_layout.tsx`), con su
  propio botón de volver nativo — no se tocaron.
- *Gotcha post-cambio*: si después de este cambio aparece un error
  "showBack is not defined" en pantalla, es caché vieja de Metro/Expo, no
  un bug de código (se verificó con grep que no queda ninguna referencia
  real a `showBack`, solo en comentarios) — solución: reiniciar el server
  con `npx expo start -c` (limpia caché) y hacer hard refresh en el
  navegador si corresponde.

## Hardening del schema vía `migrations/` (encontrado 2026-07-03)

Al analizar el repo para actualizar este archivo y `README.md` apareció
una carpeta `migrations/` con 6 archivos timestamped (`20260703120000` a
`20260703170000`) y un `schema.sql` notablemente más robusto que el descrito
en las secciones de arriba de este documento en versiones anteriores —
trabajo que no pasó por ninguna sesión de la que quede registro acá (o se
hizo directamente contra la base, o en una sesión sin bitácora). Se dejó
documentado en las secciones "Backend"/"Estructura" de arriba; en resumen:

- `20260703120000_collab_user_index_amount_checks.sql` — índice en
  `trip_collaborators(user_id)` + checks de no-negatividad en
  `planned_amount`/`amount`/`price`(x2)/`estimated_cost`.
- `20260703130000_updated_at_editable_tables.sql` — columna `updated_at` +
  trigger `set_updated_at()` en las 7 tablas que no lo tenían.
- `20260703140000_shared_place_category_enum.sql` — tipo `place_category`
  ENUM compartido entre `activities.category` y `saved_places.category`
  (antes cada una tenía su propio `CHECK` duplicado).
- `20260703150000_collaborator_role_no_owner.sql` — `trip_collaborators.role`
  ya no acepta `'owner'` (la propiedad es siempre `trips.owner_id`).
- `20260703160000_latlng_currency_checks.sql` — checks de rango en todo
  lat/lng de `trips`/`activities`/`hotels`/`saved_places` y de formato
  (`^[A-Z]{3}$`) en todo `currency`.
- `20260703170000_expenses_paid_by_index.sql` — índice en
  `expenses.paid_by_user_id`.

Todas son aditivas, idempotentes (`IF NOT EXISTS`/chequeo contra
`pg_constraint`) y con su `DOWN` comentado al final del archivo — mismo
patrón que ya usaba `migration_flights_legs.sql` (2026-07-02, en la raíz
del repo, sin timestamp). Ese archivo suelto quedó fuera de la convención
`migrations/YYYYMMDDhhmmss_*.sql` que terminó adoptándose — ya está
aplicado y reflejado en `schema.sql`, así que no hace falta volver a
correrlo, pero sería prolijo eventualmente renombrarlo/moverlo adentro de
`migrations/` para que la carpeta sea la única fuente de migraciones
(queda anotado en "Pendiente").

## Pendiente

Ítems concretos, no bloqueantes:

- Borrar `trip-planner-app/app/(tabs)/budget.tsx` a mano (quedó como
  redirect, ver sección de arriba "Presupuesto: se eliminó la pantalla
  global") y sacar `<Stack.Screen name="budget" />` de
  `app/(tabs)/_layout.tsx`.
- Mover/renombrar `migration_flights_legs.sql` (raíz del repo) adentro de
  `migrations/` con un nombre timestamped, para que todas las migraciones
  vivan en un solo lugar (ver sección de arriba).
- Cargar credenciales reales de Amadeus en `trip-planner-api/.env`
  (`AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`) para reactivar la búsqueda
  automática de hoteles/vuelos y el autocompletado de ciudades/aeropuertos.

Ideas para más adelante, si en algún momento se puede instalar
dependencias nuevas (ninguna sesión hasta ahora pudo correr
`npm install` para validarlas):

- Instalar los paquetes de Google Fonts (`@expo-google-fonts/space-grotesk`,
  `-inter`, `-space-mono` + `expo-font`) y activarlos en `theme.ts` /
  `app/_layout.tsx` — es el ítem más visible pendiente del rediseño
  "Rumbo" de arriba.

- Si en algún momento se puede instalar/probar una dependencia nueva,
  evaluar reemplazar `DatePickerField` por
  `@react-native-community/datetimepicker` (look más nativo) y el Leaflet
  por CDN de `map.web.tsx` por `react-leaflet` (no depender de un CDN
  externo).
