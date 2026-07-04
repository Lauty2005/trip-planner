import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listTrips, getTripDays, getTripHotels, getTripFlights } from '@/api/trips';
import { getBudgetSummary, type BudgetSummary } from '@/api/budget';
import { useSelectedTripStore } from '@/store/selectedTrip';
import type { Trip, ItineraryDay } from '@/types';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';
import { formatShort } from '@/utils/date';
import { AppHeader } from '@/components/AppHeader';

// Panel de Control — rediseño "Rumbo" (dossier de viaje editorial: papel +
// tinta navy + sello naranja), adaptado del boceto index.html que pasó
// Lautaro como referencia. El hero pasó de una tarjeta de imagen de fondo
// (rediseño Stitch anterior) a una "tarjeta de embarque" (main + stub
// punteado con cuenta regresiva), que es la pieza central del boceto. No
// inventamos datos de vuelo (origen/puerta/asiento) que esta pantalla no
// tiene — el stub usa lo que sí tenemos: destino, título y fechas del
// viaje real (/trips).
//
// La sección "Acciones rápidas" (Agregar actividad / Buscar vuelo / Ver
// presupuesto) se reemplazó (2026-07-01) por "Estadísticas del viaje": un
// resumen real de itinerario/presupuesto/hoteles/vuelos del viaje activo
// del carrusel de arriba, en vez de atajos genéricos.

const money = (v: number): string => Math.round(v).toLocaleString('es-AR');
const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));

interface TripStats {
  days: ItineraryDay[];
  hotelsCount: number;
  flightsCount: number;
  budget: BudgetSummary | null;
}

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function nightsBetween(start: string, end: string): number {
  const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
  return Math.max(diff, 0);
}

const STATUS_SHORT: Record<Trip['status'], string> = {
  planning: 'Planeando',
  confirmed: 'Confirmado',
  ongoing: 'En curso',
  completed: 'Hecho',
  cancelled: 'Cancelado',
};

export default function DashboardScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const setSelectedTrip = useSelectedTripStore((state) => state.setSelectedTrip);
  const { width } = useWindowDimensions();
  // El carrusel tiene que medir el ancho real del contenido, no el de la
  // ventana entera — desde que `content` tiene `maxWidth: layout.maxWidth`
  // (para no pegarse a los bordes en pantallas anchas), usar `width` a
  // secas hacía que cada página del carrusel fuera más ancha que su
  // contenedor y la tarjeta de embarque se recortaba contra el borde.
  const contentWidth = Math.min(width, layout.maxWidth);
  const heroWidth = contentWidth - spacing.containerPadding * 2;
  const carouselRef = useRef<ScrollView>(null);

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

  // Próximos viajes: hasta 3, ordenados por cercanía en el futuro. Si no hay
  // ninguno futuro (todos los viajes de prueba en el pasado), mostramos los
  // más recientes del pasado en vez de caer siempre en el primero cargado
  // en la base.
  const upcomingList = useMemo(() => {
    const withDays = trips.map((t) => ({ trip: t, days: daysUntil(t.startDate) }));
    const future = withDays.filter((x) => x.days >= 0).sort((a, b) => a.days - b.days);
    if (future.length > 0) return future.slice(0, 3).map((x) => x.trip);
    const past = withDays.filter((x) => x.days < 0).sort((a, b) => b.days - a.days);
    return past.slice(0, 3).map((x) => x.trip);
  }, [trips]);

  useEffect(() => {
    setActiveIndex(0);
    carouselRef.current?.scrollTo({ x: 0, animated: false });
  }, [upcomingList]);

  const activeTrip = upcomingList[activeIndex] ?? upcomingList[0] ?? null;

  // Estadísticas del viaje activo del carrusel — se piden de nuevo cada
  // vez que cambia (swipe del hero), no en cada render.
  const [stats, setStats] = useState<TripStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!activeTrip) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    Promise.all([
      getTripDays(activeTrip.id),
      getTripHotels(activeTrip.id),
      getTripFlights(activeTrip.id),
      getBudgetSummary(activeTrip.id),
    ])
      .then(([days, hotels, flights, budget]) => {
        if (cancelled) return;
        setStats({ days, hotelsCount: hotels.length, flightsCount: flights.length, budget });
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id]);

  const daysWithPlan = stats?.days.filter((d) => (d.activities?.length ?? 0) > 0).length ?? 0;
  const totalDays = stats?.days.length ?? 0;
  const itinPct = totalDays > 0 ? Math.round((daysWithPlan / totalDays) * 100) : 0;
  const totalSpent = stats?.budget ? num(stats.budget.totalSpent) : 0;
  const totalPlanned = stats?.budget ? num(stats.budget.totalPlanned) : 0;
  const budgetPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;
  const overBudget = totalPlanned > 0 && totalSpent > totalPlanned;
  const hotelsCount = stats?.hotelsCount ?? 0;
  const flightsCount = stats?.flightsCount ?? 0;
  const reservasTotal = hotelsCount + flightsCount;

  function openTrip(trip: Trip) {
    setSelectedTrip(trip);
    router.push(`/trip/${trip.id}`);
  }

  function handleCarouselScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (heroWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
    setActiveIndex(Math.max(0, Math.min(idx, upcomingList.length - 1)));
  }

  return (
    <View style={styles.root}>
      {/* 2026-07-03: cada pantalla del grupo dibuja su propio AppHeader
          (antes lo hacía app/(tabs)/_layout.tsx como header nativo) — ver
          el comentario en ese archivo. */}
      <AppHeader safeTop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero: próximos viajes, tarjeta de embarque deslizable */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>
            {upcomingList.length > 1 ? `${upcomingList.length} VIAJES POR VENIR` : 'PRÓXIMO VIAJE'}
          </Text>

          {loading ? (
            <View style={[styles.pass, styles.passPlaceholder]}>
              <ActivityIndicator color={colors.onImage} />
            </View>
          ) : error ? (
            <View style={[styles.pass, styles.passPlaceholder]}>
              <Text style={styles.passFallbackText}>{error}</Text>
            </View>
          ) : upcomingList.length === 0 ? (
            <Pressable style={[styles.pass, styles.passPlaceholder]} onPress={() => router.push('/new-trip')}>
              <Text style={styles.passFallbackText}>Todavía no tenés viajes.</Text>
              <Text style={styles.passFallbackLink}>Creá el primero →</Text>
            </Pressable>
          ) : (
            <>
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleCarouselScrollEnd}
                snapToInterval={heroWidth}
                decelerationRate="fast"
                style={styles.carousel}
              >
                {upcomingList.map((trip) => (
                  <Pressable key={trip.id} style={{ width: heroWidth }} onPress={() => openTrip(trip)}>
                    <BoardingPassCard trip={trip} />
                  </Pressable>
                ))}
              </ScrollView>
              {upcomingList.length > 1 ? (
                <View style={styles.dotsRow}>
                  {upcomingList.map((trip, i) => (
                    <View key={trip.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Estadísticas del viaje activo del carrusel */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>
            ESTADÍSTICAS{activeTrip ? ` · ${activeTrip.title.toUpperCase()}` : ''}
          </Text>

          {!activeTrip ? (
            <View style={[styles.statsCard, styles.statsEmpty]}>
              <Text style={styles.mutedText}>Creá un viaje para ver sus estadísticas acá.</Text>
            </View>
          ) : statsLoading || !stats ? (
            <View style={[styles.statsCard, styles.statsEmpty]}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            <Pressable style={styles.statsCard} onPress={() => openTrip(activeTrip)}>
              <View style={styles.statsRow}>
                <ProgressStat
                  label="ITINERARIO"
                  value={totalDays === 0 ? '—' : `${daysWithPlan}/${totalDays}`}
                  sub={totalDays === 0 ? 'sin días cargados' : `${itinPct}% de los días con actividades`}
                  pct={itinPct}
                  color={colors.teal}
                  empty={totalDays === 0}
                />
                <ProgressStat
                  label="PRESUPUESTO"
                  value={totalPlanned === 0 ? '—' : `${budgetPct}%`}
                  sub={totalPlanned === 0 ? 'sin presupuesto cargado' : `${money(totalSpent)} de ${money(totalPlanned)} ${activeTrip.currency}`}
                  pct={budgetPct}
                  color={overBudget ? colors.stamp : colors.gold}
                  empty={totalPlanned === 0}
                />
              </View>
              <View style={styles.statsDivider} />
              <View>
                <Text style={styles.statLabel}>RESERVAS</Text>
                {reservasTotal === 0 ? (
                  <Text style={[styles.mutedText, { textAlign: 'left', marginTop: 6 }]}>
                    Todavía no guardaste hoteles ni vuelos.
                  </Text>
                ) : (
                  <>
                    <View style={styles.reservasBar}>
                      {hotelsCount > 0 ? <View style={{ flex: hotelsCount, backgroundColor: colors.teal }} /> : null}
                      {flightsCount > 0 ? <View style={{ flex: flightsCount, backgroundColor: colors.stamp }} /> : null}
                    </View>
                    <View style={styles.reservasLegend}>
                      <LegendDot glyph="🏨" color={colors.teal} label="Hoteles" count={hotelsCount} />
                      <LegendDot glyph="✈️" color={colors.stamp} label="Vuelos" count={flightsCount} />
                    </View>
                  </>
                )}
              </View>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// "Tarjeta de embarque" — pieza central del boceto: cuerpo principal
// (destino + título + fechas en formato pass-grid) y un stub punteado a la
// derecha con la cuenta regresiva, con las muescas de perforación típicas
// de un ticket.
function BoardingPassCard({ trip }: { trip: Trip }) {
  const days = daysUntil(trip.startDate);
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const code = trip.destination
    .split(',')[0]
    .replace(/[^a-zA-Z ]/g, '')
    .trim()
    .slice(0, 3)
    .toUpperCase();

  return (
    <View style={styles.pass}>
      <View style={styles.passMain}>
        <Text style={styles.passEyebrow}>DOSSIER DE VIAJE</Text>
        <Text style={styles.passCode}>{code || '···'}</Text>
        <Text style={styles.passCity}>{trip.destination.toUpperCase()}</Text>
        <Text style={styles.passTitle}>{trip.title}</Text>

        <View style={styles.passGrid}>
          <View style={styles.passGridCol}>
            <Text style={styles.passGridK}>INICIO</Text>
            <Text style={styles.passGridV}>{formatShort(trip.startDate)}</Text>
          </View>
          <View style={styles.passGridCol}>
            <Text style={styles.passGridK}>FIN</Text>
            <Text style={styles.passGridV}>{formatShort(trip.endDate)}</Text>
          </View>
          <View style={styles.passGridCol}>
            <Text style={styles.passGridK}>NOCHES</Text>
            <Text style={styles.passGridV}>{nights}</Text>
          </View>
        </View>
      </View>

      <View style={styles.passStub}>
        <View style={styles.perfTop} />
        <View style={styles.perfBottom} />
        <Text style={styles.stubK}>CUENTA REGRESIVA</Text>
        <Text style={styles.stubBig}>{Math.max(days, 0)}</Text>
        <Text style={styles.stubUnit}>días</Text>
        <View style={styles.stubDivider} />
        <Text style={styles.stubK}>ESTADO</Text>
        <Text style={styles.stubStatus}>{STATUS_SHORT[trip.status].toUpperCase()}</Text>
      </View>
    </View>
  );
}

// Antes "Estadísticas" solo mostraba números pelados (StatBlock, sin
// gráfico). A pedido de Lautaro (2026-07-02) Itinerario y Presupuesto ahora
// tienen una barra de progreso real (mismo patrón track/trackFill que ya
// usa el dossier para categorías de presupuesto), y se sumó "Reservas": una
// mini barra apilada Hoteles/Vuelos con leyenda, para ver de un vistazo la
// mezcla sin abrir el dossier. Sin react-native-svg instalado, todo esto es
// Views con `flex`/`width%`, no un gráfico vectorial real.
function ProgressStat({
  label,
  value,
  sub,
  pct,
  color,
  empty,
}: {
  label: string;
  value: string;
  sub: string;
  pct: number;
  color: string;
  empty: boolean;
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {empty ? null : (
        <View style={styles.statTrack}>
          <View style={[styles.statTrackFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
        </View>
      )}
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function LegendDot({ glyph, color, label, count }: { glyph: string; color: string; label: string; count: number }) {
  return (
    <View style={styles.reservasLegendItem}>
      <View style={[styles.reservasDot, { backgroundColor: color }]} />
      <Text style={styles.reservasLegendGlyph}>{glyph}</Text>
      <Text style={styles.reservasLegendLabel}>{label}</Text>
      <Text style={styles.reservasLegendCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  content: {
    padding: spacing.containerPadding,
    paddingBottom: 40,
    gap: spacing.sectionGap,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  section: { gap: spacing.stackMd },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: colors.muted,
  },

  // Carrusel del hero
  carousel: { flexGrow: 0 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.stamp, width: 16 },

  // Tarjeta de embarque (hero)
  pass: {
    backgroundColor: colors.ink,
    borderRadius: radius.card,
    overflow: 'hidden',
    flexDirection: 'row',
    ...cardShadow,
  },
  passPlaceholder: { height: 260, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  passFallbackText: { color: colors.onImage, textAlign: 'center' },
  passFallbackLink: { color: colors.stamp, fontWeight: '700' },

  passMain: { flex: 1, padding: spacing.gutter, gap: 4 },
  passEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  passCode: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 34, color: colors.white, letterSpacing: -1 },
  passCity: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginTop: 2 },
  passTitle: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 17, color: colors.white, marginTop: 10 },

  passGrid: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  passGridCol: { flex: 1 },
  passGridK: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  passGridV: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 15, color: colors.white, marginTop: 3 },

  passStub: {
    width: 128,
    backgroundColor: colors.inkSoft,
    padding: spacing.stackMd,
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
  },
  perfTop: {
    position: 'absolute',
    top: -11,
    left: -11,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  perfBottom: {
    position: 'absolute',
    bottom: -11,
    left: -11,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  stubK: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  stubBig: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 30, color: colors.white, marginTop: 4 },
  stubUnit: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 12 },
  stubDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 12 },
  stubStatus: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 13, color: colors.stamp, marginTop: 3 },

  // Estadísticas del viaje activo
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  statsEmpty: { minHeight: 116, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: colors.muted, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.gutter },
  statsDivider: { height: 1, backgroundColor: colors.line },
  statBlock: { flex: 1, gap: 2 },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  statValue: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 24, color: colors.ink, letterSpacing: -0.4, marginTop: 2 },
  statSub: { fontSize: 12.5, color: colors.inkSoft },

  // Barra de progreso de Itinerario/Presupuesto (mismo track/trackFill que
  // ya usa el dossier para categorías de presupuesto).
  statTrack: { height: 7, backgroundColor: colors.paper2, borderRadius: 6, overflow: 'hidden', marginTop: 6 },
  statTrackFill: { height: '100%', borderRadius: 6 },

  // Mini gráfico "Reservas": barra apilada Hoteles/Vuelos + leyenda.
  reservasBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.paper2,
    marginTop: 8,
  },
  reservasLegend: { flexDirection: 'row', gap: 18, marginTop: 10 },
  reservasLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reservasDot: { width: 8, height: 8, borderRadius: 3 },
  reservasLegendGlyph: { fontSize: 12 },
  reservasLegendLabel: { fontSize: 12.5, color: colors.inkSoft, fontWeight: '600' },
  reservasLegendCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
});
