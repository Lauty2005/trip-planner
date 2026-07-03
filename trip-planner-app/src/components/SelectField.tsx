import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Selector de una opción entre una lista fija (Moneda, Aerolínea en el form
// de Reservas) — mismo patrón visual/de interacción que DatePickerField
// (modal a medida con Pressable, sin dependencias nuevas): tocar el campo
// abre un modal con la lista completa; con `searchable` suma un buscador
// arriba para listas largas (ej. aerolíneas). Ver SelectField.web.tsx para
// el equivalente en web (un <select> nativo del navegador).

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  glyph,
  label,
  placeholder,
  value,
  onChange,
  options,
  searchable = false,
}: {
  glyph: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function handleOpen() {
    setQuery('');
    setOpen(true);
  }

  function handleSelect(opt: SelectOption) {
    onChange(opt.value);
    setOpen(false);
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable style={styles.fieldBox} onPress={handleOpen}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <Text style={[styles.fieldText, !selected && styles.fieldPlaceholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.cardTitle}>{label}</Text>

            {searchable ? (
              <TextInput
                style={styles.search}
                placeholder="Buscar..."
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            ) : null}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.empty}>Sin resultados.</Text>
              ) : (
                filtered.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.row, opt.value === value && styles.rowSelected]}
                    onPress={() => handleSelect(opt)}
                  >
                    <Text style={[styles.rowText, opt.value === value && styles.rowTextSelected]}>{opt.label}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 2,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldText: { flex: 1, fontSize: 16, color: colors.ink },
  fieldPlaceholder: { color: colors.muted },
  chevron: { color: colors.muted, fontSize: 16, marginLeft: 6 },

  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerPadding,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  cardTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '700', color: colors.ink },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  list: { flexGrow: 0 },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 16 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.sm },
  rowSelected: { backgroundColor: colors.primaryFixed },
  rowText: { fontSize: 15, color: colors.ink },
  rowTextSelected: { fontWeight: '700' },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeButtonText: { color: colors.inkSoft, fontWeight: '600' },
});
