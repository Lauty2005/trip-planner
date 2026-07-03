import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getTripMapPins } from '@/api/trips';
import { useSelectedTripStore } from '@/store/selectedTrip';
import type { MapPin } from '@/types';
import { colors, spacing, radius, cardShadow, fonts } from '@/theme';

// react-native-maps es 100% nativo (no tiene build para web) — ver
// map.tsx. Acá usamos Leaflet, pero SIN agregarlo como dependencia de npm:
// esta pantalla corre en el navegador, así que podemos pedirle el script y
// el CSS a un CDN en tiempo de ejecución, igual que un <script> de HTML
// normal. Se evitó así instalar `leaflet`/`react-leaflet` mientras el
// sandbox de esta sesión no puede correr `npm install` para validarlos.
// Expo Router elige este archivo para el target web y map.tsx para
// iOS/Android automáticamente por la extensión .web.tsx.
//
// Nota para cuando se pueda instalar paquetes: si se prefiere no depender
// de un CDN externo, `npm install leaflet react-leaflet` y reemplazar
// loadLeaflet()/los refs de abajo por los componentes de react-leaflet.

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// Colores planos (no importamos theme dentro del HTML del ícono porque
// termina como string literal, no como estilo de RN). Mismo mapeo que
// map.tsx: teal actividades, sello hoteles, dorado lugares guardados.
const PIN_COLOR: Record<MapPin['type'], string> = {
  activity: colors.teal,
  hotel: colors.stamp,
  place: colors.gold,
};

const TYPE_LABEL: Record<MapPin['type'], string> = {
  activity: 'Actividad',
  hotel: 'Hotel',
  place: 'Lugar guardado',
};

// Leaflet no tiene tipos acá (no es una dependencia de npm) — se maneja
// como `any` a propósito, ver comentario de arriba.
let leafletLoadPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No hay DOM disponible'));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet desde el CDN'));
    document.body.appendChild(script);
  });
  return leafletLoadPromise;
}

export default function MapScreenWeb() {
  const selectedTrip = useSelectedTripStore((state) => state.selectedTrip);
  // View en react-native-web reenvía el ref al nodo DOM real (un <div>),
  // así que podemos pasárselo directo a Leaflet.
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [libReady, setLibReady] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState<string | null>(null);

  // 1) Cargar Leaflet e inicializar el mapa una sola vez.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = L.map(containerRef.current).setView([-34.6037, -58.3816], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);
        setLibReady(true);
      })
      .catch(() => {
        if (!cancelled) setLibError('No se pudo cargar el mapa (revisá tu conexión a internet).');
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // 2) Traer los pines del trip activo al enfocar la pestaña, y refrescar
  // el tamaño del mapa (Leaflet mide mal si se inicializó con la pestaña
  // oculta).
  useFocusEffect(
    useCallback(() => {
      mapRef.current?.invalidateSize();

      if (!selectedTrip) {
        setPins([]);
        return;
      }
      let cancelled = false;
      setPinsLoading(true);
      setPinsError(null);
      getTripMapPins(selectedTrip.id)
        .then((data) => {
          if (!cancelled) setPins(data);
        })
        .catch(() => {
          if (!cancelled) setPinsError('No se pudieron cargar los puntos del viaje.');
        })
        .finally(() => {
          if (!cancelled) setPinsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [selectedTrip])
  );

  // 3) Pintar markers cada vez que cambian los pines o el mapa termina de
  // inicializarse. Centra en el destino del trip si lo tiene geocodificado.
  useEffect(() => {
    const L = (window as any).L;
    if (!libReady || !mapRef.current || !L) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (selectedTrip?.destinationLat != null && selectedTrip?.destinationLng != null) {
      mapRef.current.setView([selectedTrip.destinationLat, selectedTrip.destinationLng], 12);
    }

    pins.forEach((pin) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${PIN_COLOR[pin.type]};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<strong>${escapeHtml(pin.title)}</strong><br/>${TYPE_LABEL[pin.type]}`);
      markersRef.current.push(marker);
    });

    if (pins.length > 0) {
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [pins, libReady, selectedTrip]);

  const showSpinner = !libReady && !libError;
  const showLibError = libReady === false && !!libError;

  return (
    <View style={styles.container}>
      {/* containerRef es `any` a propósito: react-native-web reenvía este ref
          al <div> real (ver comentario arriba de loadLeaflet), no al tipo
          `View` de react-native que espera el resto del código nativo. */}
      <View ref={containerRef} style={styles.map} />

      {showSpinner ? (
        <View style={styles.banner}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : showLibError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerErrorText}>{libError}</Text>
        </View>
      ) : !selectedTrip ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Elegí un viaje en "Mis viajes" para ver sus pines acá.</Text>
        </View>
      ) : pinsLoading ? (
        <View style={styles.banner}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : pinsError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerErrorText}>{pinsError}</Text>
        </View>
      ) : pins.length === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {selectedTrip.title} todavía no tiene actividades, hoteles o lugares con ubicación cargada.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Los popups de Leaflet toman HTML crudo — escapamos el título por las
// dudas antes de interpolarlo (nombres de actividad/hotel vienen del
// usuario).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const styles = StyleSheet.create({
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
