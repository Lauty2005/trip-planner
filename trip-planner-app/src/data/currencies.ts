// Lista fija de monedas para el selector de Moneda en el form de Reservas
// (app/(tabs)/explore.tsx). No sale de ninguna API — es una lista corta a
// mano con las monedas más relevantes para el tipo de viajes que arma la
// app (Argentina + destinos internacionales típicos).

export interface CurrencyOption {
  value: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'BRL', label: 'BRL — Real brasileño' },
  { value: 'CLP', label: 'CLP — Peso chileno' },
  { value: 'UYU', label: 'UYU — Peso uruguayo' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'GBP', label: 'GBP — Libra esterlina' },
  { value: 'JPY', label: 'JPY — Yen japonés' },
  { value: 'CAD', label: 'CAD — Dólar canadiense' },
  { value: 'AUD', label: 'AUD — Dólar australiano' },
  { value: 'CHF', label: 'CHF — Franco suizo' },
];
