import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMe } from '@/api/auth';
import { colors, spacing, radius, fonts, layout } from '@/theme';

// Header compartido "tipo pestañas" (2026-07-01): reemplaza tanto la tab
// bar de abajo que tenía app/(tabs) como el header a medida que se había
// escrito una sola vez dentro de app/trip/[tripId]/index.tsx. Ahora es UN
// solo componente para que la navegación de toda la app sea consistente:
// logo (vuelve a Inicio) + 3 links + avatar. A pedido de Lautaro, la
// navegación principal pasó de tabs abajo a este header arriba, y se
// redujo a únicamente Mis viajes / Explorar / Perfil (Presupuesto, Gastos
// y Mapa no son destinos de primer nivel: viven como pestañas dentro del
// dossier de cada viaje — ver app/trip/[tripId]/index.tsx). La pantalla
// global /(tabs)/budget se eliminó (2026-07-02, toda la gestión de
// presupuesto/gastos vive en el dossier); /(tabs)/map se dejó como ruta
// alcanzable por links puntuales para no romper nada existente.

// 2026-07-03, a pedido de Lautaro: se sacó "Perfil" de los links de texto —
// el avatar (círculo con la inicial, a la derecha) ya navega a /profile al
// tocarlo, así que el link de texto quedaba redundante. Se deja el avatar
// como ÚNICO camino a Perfil.
const NAV_LINKS = [
  { href: '/(tabs)/trips' as const, label: 'Mis viajes' },
  // Antes decía "Explorar" (búsqueda contra Amadeus). Con esa búsqueda en
  // pausa (ver app/(tabs)/explore.tsx), la pantalla pasó a ser carga manual
  // de hoteles/vuelos — "Reservas" describe mejor lo que hay ahí ahora. La
  // ruta (/(tabs)/explore) no cambió para no romper los links que ya
  // apuntan a ella (dossier de viaje, etc.).
  { href: '/(tabs)/explore' as const, label: 'Reservas' },
];

// 2026-07-02, a pedido de Lautaro: botón "← Volver" en TODAS las pantallas
// que dibujan este header salvo Inicio (volver desde Inicio no tendría
// destino) — antes solo el dossier de viaje pedía explícitamente
// `showBack`, con un simple glyph "‹" que hacía `router.back()` (volvía a
// la pantalla anterior en el historial, no siempre Inicio). Ahora se
// calcula solo, mirando la ruta actual, y siempre vuelve a Inicio con
// `router.replace('/(tabs)')` — igual que tocar el logo — en vez de
// depender del historial de navegación.
// `safeTop`: cuando expo-router dibuja este componente como `header` de un
// Stack nativo (app/(tabs)/_layout.tsx), la propia navegación nativa ya lo
// posiciona debajo del status bar/notch Y respeta los insets laterales
// (cámara punch-hole descentrada, isla dinámica, etc). Pero en
// app/trip/[tripId]/index.tsx se usa `headerShown: false` y este componente
// se monta a mano dentro de un View plano — ahí nadie reserva ese espacio,
// así que además de quedar tapado por la barra de estado (visto con
// Lautaro: "Volver" pisado por el reloj), en dispositivos con la cámara
// selfie descentrada "Perfil" y el avatar quedaban por debajo de la zona
// física de la cámara. `safeTop` suma insets.top/left/right solo en ese
// caso, para no tocar el caso que ya funciona bien dentro del Stack.
export function AppHeader({ safeTop = false }: { safeTop?: boolean }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [initial, setInitial] = useState<string | null>(null);
  const isHome = pathname === '/' || pathname === '/(tabs)' || pathname === '';

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setInitial(me.name?.trim()?.[0]?.toUpperCase() ?? '?');
      })
      .catch(() => {
        if (!cancelled) setInitial('?');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    // El fondo tinta va full-bleed (borde a borde); lo que se centra con
    // un ancho máximo es la fila de adentro (logo/links/avatar), igual
    // que el contenido de cada pantalla — así en pantallas anchas el
    // header queda alineado con el contenido de abajo en vez de quedar
    // pegado a los bordes de la ventana.
    <View style={[styles.headerBg, safeTop && { paddingTop: insets.top }]}>
      <View
        style={[
          styles.header,
          safeTop && { paddingLeft: spacing.gutter + insets.left, paddingRight: spacing.gutter + insets.right },
        ]}
      >
        {isHome ? null : (
          <Pressable hitSlop={10} style={styles.backButton} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.backButtonText}>← Volver</Text>
          </Pressable>
        )}

        {/* replace (no push) para no acumular Inicio/Mis viajes/Explorar/Perfil
            en la pila de vuelta atrás — con Stack en vez de Tabs, moverse
            entre estos 4 destinos debería sentirse "plano", como tabs. */}
        <Pressable onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.brand}>
            ViajaYa<Text style={styles.brandDot}>.</Text>
          </Text>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.navLinks}
          contentContainerStyle={styles.navLinksContent}
        >
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href.replace('/(tabs)', ''));
            return (
              <Pressable key={link.href} onPress={() => router.replace(link.href)}>
                <Text style={[styles.navLink, active && styles.navLinkActive]}>{link.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable hitSlop={10} style={styles.avatar} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={styles.avatarGlyph}>{initial ?? '···'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBg: { backgroundColor: colors.ink },
  header: {
    height: 60,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backButton: { paddingVertical: 6, paddingRight: 2 },
  backButtonText: { color: colors.white, fontSize: 13.5, fontFamily: fonts.displaySemibold, fontWeight: '600' },
  brand: { fontFamily: fonts.displaySemibold, fontSize: 18, fontWeight: '700', color: colors.white, letterSpacing: -0.4 },
  brandDot: { color: colors.stamp },
  navLinks: { flex: 1 },
  navLinksContent: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20 },
  navLink: { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, fontFamily: fonts.displaySemibold },
  navLinkActive: { color: colors.white },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 13, color: colors.white },
});
