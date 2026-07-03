import { Stack } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { colors } from '@/theme';

// Navegación principal — pasó de tab bar abajo a header arriba (pedido de
// Lautaro, 2026-07-01): un solo AppHeader compartido (logo + Mis viajes /
// Explorar / Perfil + avatar) reemplaza tanto la Tabs bar de acá como el
// header a medida que tenía cada pantalla. Se usa Stack en vez de Tabs
// porque ya no hay una barra de pestañas nativa que dibujar — el propio
// AppHeader hace de navegación, y usa router.replace (no push) entre
// Inicio/Mis viajes/Explorar/Perfil para que moverse entre ellas no
// acumule historial de "atrás" (se siente como tabs aunque técnicamente
// sea un Stack).
//
// index/trips/explore/profile son los 4 destinos con link visible en el
// header. map sigue existiendo como ruta completa (la usan enlaces
// puntuales) pero ya no tiene un link propio en la navegación principal.
// budget (2026-07-02) dejó de ser una pantalla real: TODA la gestión de
// presupuesto/gastos se mudó a las pestañas Presupuesto/Gastos del dossier
// de cada viaje (app/trip/[tripId]/index.tsx) — el archivo budget.tsx que
// queda es solo un redirect por si algo viejo todavía apunta acá (no se
// pudo borrar el archivo en esta sesión por falta de acceso a shell; ver
// el comentario en ese archivo).
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="trips" />
      <Stack.Screen name="explore" />
      <Stack.Screen name="map" />
      <Stack.Screen name="budget" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
