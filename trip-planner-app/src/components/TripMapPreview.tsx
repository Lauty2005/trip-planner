import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { MapPin } from '@/types';
import { colors, radius } from '@/theme';

// Vista previa de mapa para el tab "Mapa" del dossier de viaje (nativo,
// iOS/Android). Distinto de app/(tabs)/map.tsx: ese es el mapa global de la
// tab bar (depende del store selectedTrip + ubicación del usuario); este
// es un mapa acotado a los pines de UN trip puntual, recibidos por props,
// sin depender de ningún store. Ver TripMapPreview.web.tsx para el
// equivalente en web (Leaflet) — Metro elige el archivo correcto según
// plataforma automáticamente por el sufijo .web.tsx, sin tocar
// metro.config.js (esa intercepción solo hacía falta para las rutas de
// Expo Router, no para un componente común importado así).

const PIN_COLOR: Record<MapPin['type'], string> = {
  activity: colors.teal,
  hotel: colors.stamp,
  place: colors.gold,
};

export function TripMapPreview({
  pins,
  centerLat,
  centerLng,
  height = 260,
}: {
  pins: MapPin[];
  centerLat?: number;
  centerLng?: number;
  height?: number;
}) {
  const lat = centerLat ?? pins[0]?.lat ?? -34.6037;
  const lng = centerLng ?? pins[0]?.lng ?? -58.3816;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={styles.map}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
      >
        {pins.map((pin) => (
          <Marker
            key={`${pin.type}-${pin.id}`}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.title}
            pinColor={PIN_COLOR[pin.type]}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  map: { flex: 1 },
});
