import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { MapPin } from '@/types';
import { colors, radius, fonts } from '@/theme';

// Equivalente web de TripMapPreview.tsx — mismo patrón que
// app/(tabs)/map.web.tsx: Leaflet cargado desde CDN en tiempo de ejecución
// (sin sumar `leaflet`/`react-leaflet` a package.json, ver esa pantalla
// para la nota completa sobre por qué). Acotado a los pines de un trip
// puntual recibidos por props, sin depender del store selectedTrip ni de
// useFocusEffect (este componente vive dentro de una sola pestaña del
// dossier, no de una tab de la barra inferior).

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const PIN_COLOR: Record<MapPin['type'], string> = {
  activity: colors.teal,
  hotel: colors.stamp,
  place: colors.gold,
};

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Cargar Leaflet e inicializar el mapa una sola vez, centrado en el
  // destino del trip (o el primer pin) si lo tenemos.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const lat = centerLat ?? pins[0]?.lat ?? -34.6037;
        const lng = centerLng ?? pins[0]?.lng ?? -58.3816;
        mapRef.current = L.map(containerRef.current).setView([lat, lng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el mapa (revisá tu conexión a internet).');
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Solo al montar: centerLat/centerLng/pins iniciales alcanzan para la
    // vista inicial, los pines se repintan aparte en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Pintar/actualizar markers cuando cambian los pines.
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !mapRef.current || !L) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    pins.forEach((pin) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${PIN_COLOR[pin.type]};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<strong>${escapeHtml(pin.title)}</strong>`);
      markersRef.current.push(marker);
    });

    if (pins.length > 0) {
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
    // Leaflet mide mal si el contenedor cambió de tamaño (ej. al activar
    // esta pestaña, que estaba oculta con display:none hasta ahora).
    setTimeout(() => mapRef.current?.invalidateSize(), 60);
  }, [pins, ready]);

  return (
    <View style={[styles.wrap, { height }]}>
      <View ref={containerRef} style={styles.map} />
      {!ready && !error ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : error ? (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, position: 'relative' },
  map: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper2 },
  errorText: { fontFamily: fonts.mono, fontSize: 12, color: colors.stamp, textAlign: 'center', paddingHorizontal: 16 },
});
