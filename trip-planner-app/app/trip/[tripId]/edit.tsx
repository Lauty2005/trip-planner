import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getTrip, updateTrip } from '@/api/trips';
import { DatePickerField } from '@/components/DatePickerField';
import type { TripStatus } from '@/types';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';

// Modal "Editar viaje", accesible desde el botón del dossier
// (app/trip/[tripId]/index.tsx). Mismo patrón de formulario que
// new-trip.tsx, pero precargado con los datos actuales del viaje y
// llamando a updateTrip (PATCH /trips/:tripId, ya soportado por el
// backend) en vez de createTrip. Al volver con router.back(), el
// useFocusEffect del dossier refresca los datos solo.

const STATUS_OPTIONS: TripStatus[] = ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'];
const STATUS_LABEL: Record<TripStatus, string> = {
  planning: 'Planificando',
  confirmed: 'Confirmado',
  ongoing: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export default function EditTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<TripStatus>('planning');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getTrip(tripId)
        .then((trip) => {
          if (cancelled) return;
          setTitle(trip.title);
          setDestination(trip.destination);
          setStartDate(trip.startDate);
          setEndDate(trip.endDate);
          setCurrency(trip.currency);
          setStatus(trip.status);
        })
        .catch(() => {
          if (!cancelled) setError('No se pudo cargar el viaje.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [tripId])
  );

  async function handleSave() {
    if (!title || !destination || !startDate || !endDate) {
      setError('Completá título, destino y las dos fechas.');
      return;
    }
    if (endDate < startDate) {
      setError('La fecha de fin tiene que ser posterior (o igual) a la de inicio.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateTrip(tripId, { title, destination, startDate, endDate, currency, status });
      router.back();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo guardar el viaje.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Editar viaje', presentation: 'modal' }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Título</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Destino</Text>
        <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholderTextColor={colors.muted} />

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <DatePickerField glyph="🗓️" label="Fecha de inicio" placeholder="Elegí una fecha" value={startDate} onChange={setStartDate} />
          </View>
          <View style={styles.dateField}>
            <DatePickerField
              glyph="🗓️"
              label="Fecha de fin"
              placeholder="Elegí una fecha"
              value={endDate}
              onChange={setEndDate}
              minDate={startDate || undefined}
            />
          </View>
        </View>

        <Text style={styles.label}>Moneda</Text>
        <TextInput
          style={styles.input}
          value={currency}
          onChangeText={setCurrency}
          autoCapitalize="characters"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Estado</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((s) => (
            <Pressable key={s} style={[styles.statusChip, status === s && styles.statusChipSelected]} onPress={() => setStatus(s)}>
              <Text style={[styles.statusChipLabel, status === s && styles.statusChipLabelSelected]}>{STATUS_LABEL[s]}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleSave} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  container: {
    padding: spacing.containerPadding,
    gap: spacing.stackSm,
    paddingBottom: 40,
    width: '100%',
    maxWidth: layout.formMaxWidth,
    alignSelf: 'center',
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: spacing.stackSm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  dateRow: { flexDirection: 'row', gap: spacing.stackMd, marginTop: spacing.stackSm },
  dateField: { flex: 1 },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusChip: { backgroundColor: colors.paper2, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: 'transparent' },
  statusChipSelected: { borderColor: colors.stamp, backgroundColor: colors.primaryFixed },
  statusChipLabel: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.inkSoft },
  statusChipLabelSelected: { color: colors.ink, fontWeight: '700' },
  error: { color: colors.stamp, marginTop: spacing.stackSm },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    padding: 14,
    alignItems: 'center',
    marginTop: spacing.stackLg,
    ...cardShadow,
  },
  buttonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 16 },
  cancelButton: { alignItems: 'center', paddingVertical: 14 },
  cancelButtonText: { color: colors.muted, fontWeight: '600' },
});
