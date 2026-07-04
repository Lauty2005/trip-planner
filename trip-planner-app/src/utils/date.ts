// Helpers de formato de fecha compartidos entre pantallas. `formatShort`
// vivía duplicado como función local en app/(tabs)/index.tsx (usado para
// "22-DIC"/"01-ENE" en la tarjeta de "Próximo viaje") — se movió acá
// (2026-07-03) para poder reusarlo también en la tarjeta de embarque del
// dossier (app/trip/[tripId]/index.tsx), que mostraba la fecha completa en
// ISO ("2026-12-23") y se partía en 2-3 renglones por falta de espacio en
// las columnas de la tarjeta.

// "23 dic" — día + mes corto en español, sin el punto que agrega
// toLocaleDateString después de la abreviatura del mes.
export function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase();
}
