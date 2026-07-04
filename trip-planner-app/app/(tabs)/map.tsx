import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { getTripMapPins } from '@/api/trips';
import { useSelectedTripStore } from '@/store/selectedTrip';
import type { MapPin } from '@/types';
import { colors, spacing, radius, cardShadow, fonts } from '@/theme';
import { AppHeader } from '@/components/AppHeader';

// Mapa con los pines reales del trip activo (actividades + hoteles + lugares
// guardados, vía /trips/:tripId/map — un solo request, sin geocoding en el
// cliente). Sin trip seleccionado, cae al comportamiento anterior: centrar
// en la ubicación del usuario.
// Colores de pin acordes al boceto "Rumbo": teal para actividades, sello
// naranja para hoteles, dorado para lugares guardados.

const PIN_COLOR: Record<MapPin['type'], string> = {
  activity: colors.teal,
  hotel: colors.stamp,
  place: colors.gold,
};

const PIN_LABEL: Record<MapPin['type'], string> = {
  activity: 'Actividad',
  hotel: 'Hotel',
  place: 'Lugar guardado',
};

export default function MapScreen() {
  const selectedTrip = useSelectedTripStore((state) => state.selectedTrip);
  const [region, setRegion] = useState({
    latitude: -34.6037,
    longitude: -58.3816,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin trip seleccionado: centrar en la ubicación del usuario (comportamiento
  // previo, sirve como fallback general del mapa).
  useEffect(() => {
    if (selectedTrip) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      setRegion((prev) => ({
        ...prev,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }));
    })();
  }, [selectedTrip]);

  // Con trip seleccionado: centrar en el destino (si lo tiene geocodificado)
  // y traer los pines reales. Refetch al volver a la pestaña, por si se
  // guardó un hotel/vuelo o se cargó una actividad desde otra pantalla.
  useFocusEffect(
    useCallback(() => {
      if (!selectedTrip) {
        setPins([]);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);

      if (selectedTrip.destinationLat != null && selectedTrip.destinationLng != null) {
        setRegion((prev) => ({
          ...prev,
          latitude: selectedTrip.destinationLat!,
          longitude: selectedTrip.destinationLng!,
        }));
      }

      getTripMapPins(selectedTrip.id)
        .then((data) => {
          if (!cancelled) setPins(data);
        })
        .catch(() => {
          if (!cancelled) setError('No se pudieron cargar los puntos del viaje.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [selectedTrip])
  );

  return (
    <View style={styles.pageRoot}>
      <AppHeader safeTop />
      <View style={styles.container}>
        <MapView style={styles.map} region={region}>
        {selectedTrip
          ? pins.map((pin) => (
              <Marker
                key={`${pin.type}-${pin.id}`}
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                title={pin.title}
                description={PIN_LABEL[pin.type]}
                pinColor={PIN_COLOR[pin.type]}
              />
            ))
          : <Marker coordinate={region} title="Vos estás acá" />}
      </MapView>

      {!selectedTrip ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Elegí un viaje en "Mis viajes" para ver sus pines acá.</Text>
        </View>
      ) : loading ? (
        <View style={styles.banner}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerErrorText}>{error}</Text>
        </View>
      ) : pins.length === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {selectedTrip.title} todavía no tiene actividades, hoteles o lugares con ubicación cargada.
          </Text>
        </View>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1 },
  container: { flex: 1 },
  map: { flex: 1 },
  banner: {
    position: 'absolute',
    bottom: spacing.gutter,
    left: spacing.gutter,
    right: spacing.gutter,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.stackMd,
    alignItems: 'center',
    ...cardShadow,
  },
  bannerText: { fontFamily: fonts.mono, color: colors.inkSoft, textAlign: 'center', fontSize: 12.5 },
  bannerErrorText: { fontFamily: fonts.mono, color: colors.stamp, textAlign: 'center', fontSize: 12.5 },
});
