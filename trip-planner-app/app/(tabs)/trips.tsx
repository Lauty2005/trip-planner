import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listTrips } from '@/api/trips';
import { useSelectedTripStore } from '@/store/selectedTrip';
import type { Trip } from '@/types';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';
import { AppHeader } from '@/components/AppHeader';

// Mis viajes — rediseño "Rumbo": tarjetas tipo ficha de dossier (papel,
// borde fino, eyebrow mono con el destino) en vez de las tarjetas Material
// del rediseño Stitch anterior.
//
// El botón "+ Nuevo" vivía en headerRight del Stack.Screen nativo; con el
// grupo (tabs) usando un header custom (AppHeader) en vez del nativo,
// headerRight/headerLeft/headerTitle ya no se dibujan — por eso el botón
// vive acá arriba, dentro del cuerpo de la pantalla.

export default function TripsListScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setSelectedTrip = useSelectedTripStore((state) => state.setSelectedTrip);

  // Refetch cada vez que la pantalla vuelve a estar en foco (no solo al
  // montar), así al volver de "Nuevo viaje" la lista ya aparece actualizada.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      listTrips()
        .then((data) => {
          if (!cancelled) setTrips(data);
        })
        .catch(() => {
          if (!cancelled) setError('No se pudieron cargar los viajes. Revisá tu conexión con el backend.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function handleOpenTrip(trip: Trip) {
    setSelectedTrip(trip);
    router.push(`/trip/${trip.id}`);
  }

  return (
    <View style={styles.pageRoot}>
      <AppHeader safeTop />
      <View style={styles.screenHead}>
        <Text style={styles.eyebrow}>MIS VIAJES</Text>
        <Pressable style={styles.headerButton} onPress={() => router.push('/new-trip')} hitSlop={12}>
          <Text style={styles.headerButtonText}>+ Nuevo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Cargando viajes...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Todavía no tenés viajes.</Text>
          <Pressable onPress={() => router.push('/new-trip')}>
            <Text style={styles.link}>Creá el primero</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={styles.root}
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => handleOpenTrip(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardEyebrow}>{item.destination.toUpperCase()}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={styles.cardFoot}>
                <Text style={styles.cardDates}>
                  {item.startDate} → {item.endDate}
                </Text>
                <Text style={styles.cardArrow}>→</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.stackLg,
    gap: spacing.stackSm,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted },
  errorText: { color: colors.stamp, textAlign: 'center' },
  link: { color: colors.ink, fontWeight: '700' },
  screenHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerPadding,
    paddingTop: spacing.stackLg,
    paddingBottom: spacing.stackSm,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  headerButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerButtonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13 },
  list: {
    padding: spacing.containerPadding,
    gap: spacing.stackMd,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: 6,
    ...cardShadow,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: tracking.wide,
    color: colors.muted,
  },
  statusPill: {
    backgroundColor: colors.primaryFixed,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    letterSpacing: tracking.normal,
    color: colors.ink,
  },
  cardTitle: { fontFamily: fonts.displaySemibold, fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: 'dashed',
  },
  cardDates: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.inkSoft },
  cardArrow: { color: colors.stamp, fontWeight: '700', fontSize: 16 },
});
