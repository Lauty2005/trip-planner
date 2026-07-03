import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, Stack } from 'expo-router';
import { createTrip } from '@/api/trips';
import { DatePickerField } from '@/components/DatePickerField';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';

// Pantalla simple de alta de trip. Se navega acá con router.push('/new-trip')
// desde el header de "Mis viajes"; al crear, vuelve atrás con router.back()
// y la lista se refresca sola gracias al useFocusEffect en index.tsx.
// Las fechas usan DatePickerField (calendario propio, ver
// src/components/DatePickerField.tsx) en vez de texto libre. A diferencia
// de la búsqueda de hoteles/vuelos, acá no se restringe la fecha de inicio
// a "hoy en adelante": el trip puede cargarse para un viaje ya hecho.
export default function NewTripScreen() {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
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
      await createTrip({ title, destination, startDate, endDate, currency });
      router.back();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo crear el viaje.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Nuevo viaje', presentation: 'modal' }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.container}>
        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Bariloche"
          placeholderTextColor={colors.outlineVariant}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Destino</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Bariloche, Argentina"
          placeholderTextColor={colors.outlineVariant}
          value={destination}
          onChangeText={setDestination}
        />

        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <DatePickerField
              glyph="🗓️"
              label="Fecha de inicio"
              placeholder="Elegí una fecha"
              value={startDate}
              onChange={setStartDate}
            />
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
          placeholder="USD"
          placeholderTextColor={colors.outlineVariant}
          value={currency}
          onChangeText={setCurrency}
          autoCapitalize="characters"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleCreate} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Creando...' : 'Crear viaje'}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background },
  container: {
    padding: spacing.containerPadding,
    gap: spacing.stackSm,
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
    borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    padding: 12,
    fontSize: 16,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  dateRow: { flexDirection: 'row', gap: spacing.stackMd, marginTop: spacing.stackSm },
  dateField: { flex: 1 },
  error: { color: colors.secondary, marginTop: spacing.stackSm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    padding: 14,
    alignItems: 'center',
    marginTop: spacing.stackLg,
    ...cardShadow,
  },
  buttonText: { color: colors.onPrimary, fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 16 },
});
