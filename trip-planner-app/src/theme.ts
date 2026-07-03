// Tokens de diseño "Rumbo" — dossier de viaje editorial (papel cálido +
// tinta navy + sello naranja), adaptado del boceto index.html que pasó
// Lautaro como referencia visual (2026-07-01). Reemplaza la paleta
// Material 3 azul/coral del rediseño Stitch anterior ("Smart Travel
// Planner"). Mantenemos los mismos NOMBRES de export (colors, spacing,
// radius, cardShadow) para no reescribir el acceso a estilos en cada
// pantalla desde cero — lo que cambia son los VALORES y se suman algunos
// tokens nuevos (fonts, tracking) sin equivalente en la paleta anterior.
//
// Tipografía: el boceto usa Space Grotesk (display, títulos), Inter
// (cuerpo) y Space Mono (mono — "eyebrows" en mayúsculas con tracking
// ancho, datos tipo tarjeta de embarque). Activarlas requiere paquetes
// @expo-google-fonts (expo-font + fuentes .ttf), que necesitan
// `npm install`/`npx expo install` — el sandbox de esta sesión no puede
// correrlo. Arrancamos con fuentes del sistema como aproximación; cuando
// se puedan instalar los paquetes, alcanza con:
//   npx expo install expo-font @expo-google-fonts/space-grotesk @expo-google-fonts/space-mono @expo-google-fonts/inter
// y reemplazar los valores de `fonts` de abajo por los nombres reales
// ('SpaceGrotesk_700Bold', 'Inter_400Regular', 'SpaceMono_400Regular',
// etc.), cargándolos con useFonts() en app/_layout.tsx antes de renderizar.

import { Platform } from 'react-native';

export const colors = {
  // Fondo general: papel cálido (antes arena Material 3 #F3E9DC).
  background: '#F3EFE6',
  surface: '#FBF9F4',
  surfaceVariant: '#EAE4D6',
  surfaceContainer: '#EAE4D6',

  // Tinta navy — antes azul Material (#004AC6). Hace de "primary": headers,
  // botones sólidos, texto de énfasis.
  primary: '#16233D',
  primaryContainer: '#2B3A57',
  onPrimary: '#FBF9F4',
  // Chip/pill claro sobre fondo papel (antes azul clarito DBE1FF).
  primaryFixed: '#EFE3DB',
  onPrimaryFixed: '#16233D',
  surfaceContainerHigh: '#EAE4D6',

  // Acento "sello" (naranja sello postal) — reemplaza el coral anterior,
  // mismo rol: CTAs secundarios, precios, pines, alertas de error suave.
  secondary: '#E7552F',
  secondaryContainer: '#E7552F',
  onSecondaryContainer: '#FBF9F4',

  // Teal — antes gris oliva "tertiary". Segundo acento (categorías, dots).
  tertiary: '#2C7A6B',

  onSurface: '#16233D',
  onSurfaceVariant: '#2B3A57',
  outline: '#8A8577',
  outlineVariant: '#D8D1C0',

  // Texto sobre imágenes / overlays oscuros.
  onImage: '#FBF9F4',
  overlay: 'rgba(22, 35, 61, 0.55)',

  // --- Tokens nuevos, sin equivalente en la paleta Material anterior ---
  // Nombrados igual que las variables CSS del boceto para que sea fácil
  // volver a mirar index.html y encontrar el mapeo.
  ink: '#16233D',
  inkSoft: '#2B3A57',
  paper: '#F3EFE6',
  paper2: '#EAE4D6',
  stamp: '#E7552F',
  teal: '#2C7A6B',
  gold: '#C9A227',
  muted: '#8A8577',
  line: '#D8D1C0',
  white: '#FBF9F4',
} as const;

export const spacing = {
  stackSm: 4,
  stackMd: 12,
  gutter: 16,
  containerPadding: 20,
  stackLg: 24,
  sectionGap: 40,
} as const;

// El boceto es mucho menos "bubbly" que el Material anterior (--r:14px
// contra los 24px de radius.card viejo) — más papel/editorial, menos
// burbuja. sm/pill son tokens nuevos para insignias chicas y stubs.
export const radius = {
  sm: 9,
  lg: 12,
  xl: 14,
  card: 14,
  full: 9999,
} as const;

// Sombra suave (antes azulada #2563EB) — ahora tintada de tinta navy, más
// sutil, acorde al look "papel".
export const cardShadow = {
  shadowColor: '#16233D',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.14,
  shadowRadius: 10,
  elevation: 3,
} as const;

// Ver nota larga arriba: fuentes del sistema como stand-in de Space
// Grotesk/Inter/Space Mono hasta poder instalar los paquetes reales.
export const fonts = {
  display: Platform.select<string | undefined>({ ios: 'Avenir Next', android: 'sans-serif-medium', default: undefined }),
  displaySemibold: Platform.select<string | undefined>({ ios: 'Avenir Next', android: 'sans-serif-medium', default: undefined }),
  body: undefined as string | undefined,
  mono: Platform.select<string>({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
} as const;

// Letter-spacing de los "eyebrow" / datos mono del boceto (mayúsculas +
// tracking ancho, ej. "VIAJE ACTIVO · 7 DÍAS").
export const tracking = {
  normal: 0.3,
  wide: 1,
  eyebrow: 2,
} as const;

// En pantallas grandes (web/desktop) el boceto nunca estira las tarjetas
// hasta el borde de la ventana: el fondo (papel/tinta) es full-bleed, pero
// el contenido (header, hero, tabs, cards) vive en una columna centrada de
// ancho fijo. `layout.maxWidth` es ese ancho; se combina siempre con
// `width: '100%'` + `alignSelf: 'center'` en el contenedor con padding de
// cada pantalla, así en mobile (donde el viewport nunca llega a
// maxWidth) no cambia nada.
export const layout = {
  maxWidth: 1180,
  // Formularios angostos (login/registro, nuevo viaje, editar viaje): el
  // ancho de página completo se ve raro con 2-3 inputs sueltos, así que
  // usan un máximo más chico, también centrado.
  formMaxWidth: 480,
} as const;
