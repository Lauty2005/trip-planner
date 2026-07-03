import { colors } from '@/theme';

// Helpers puramente visuales para presupuesto/gastos — separados en su
// propio archivo (2026-07-02, a pedido de Lautaro) porque antes vivían
// dentro de app/(tabs)/budget.tsx y el dossier de viaje
// (app/trip/[tripId]/index.tsx) los importaba desde ahí con una ruta
// relativa. Al pasar TODA la gestión de presupuesto (categorías, gráfico,
// "Agregar categoría") a la pestaña Presupuesto del dossier y eliminar la
// pantalla global /(tabs)/budget, ese import se hubiera roto — por eso
// quedan acá, en un módulo neutral que cualquiera de las dos pantallas
// puede usar.

// Paleta de categoría cíclica (teal / ink / sello / dorado / muted para las
// primeras 5 categorías, y repite si hay más).
export const CATEGORY_COLORS = [colors.teal, colors.ink, colors.stamp, colors.gold, colors.muted];

export function categoryGlyph(name: string): string {
  const n = name.toLowerCase();
  if (/vuelo|flight|avi/.test(n)) return '✈️';
  if (/hotel|hosped|aloj|stay/.test(n)) return '🏨';
  if (/comida|food|resto|restaur|eat/.test(n)) return '🍽️';
  if (/transp|tren|bus|taxi|transport/.test(n)) return '🚆';
  if (/activ|tour|paseo|entrad|ticket/.test(n)) return '🎟️';
  if (/compra|shop|regalo|gift/.test(n)) return '🛍️';
  return '💰';
}
