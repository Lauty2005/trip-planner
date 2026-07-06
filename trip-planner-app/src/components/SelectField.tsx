import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Selector de una opción entre una lista fija (Moneda, Aerolínea en el form
// de Reservas) — mismo patrón visual/de interacción que DatePickerField
// (modal a medida con Pressable, sin dependencias nuevas): tocar el campo
// abre un modal con la lista completa; con `searchable` suma un buscador
// arriba para listas largas (ej. aerolíneas). Ver SelectField.web.tsx para
// el equivalente en web (un <select> nativo del navegador).
//
// `creatable` (2026-07-06, a pedido de Lautaro — categoría de presupuesto
// del form de Reservas): si lo que se tipeó no matchea ninguna opción
// existente, aparece una fila "+ Crear "texto"" arriba de la lista que
// llama a `onCreateOption` (async — hace el POST real) y, si devuelve una
// opción, la selecciona sola y cierra el modal. Fuerza el buscador visible
// aunque no se pase `searchable`, porque sin poder tipear no hay forma de
// crear nada nuevo.

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
  creatable = false,
  onCreateOption,
}: {
  glyph: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  searchable?: boolean;
  creatable?: boolean;
  // Crea la opción nueva del lado del padre (ej. POST /budget-categories)
  // y devuelve {value, label} lista para seleccionar — `null`/throw si
  // falló, y SelectField se lo muestra al usuario sin cerrar el modal.
  onCreateOption?: (query: string) => Promise<SelectOption | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const hasExactMatch = options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreateRow = creatable && trimmedQuery.length > 0 && !hasExactMatch;

  function handleOpen() {
    setQuery('');
    setCreateError(null);
    setOpen(true);
  }

  function handleSelect(opt: SelectOption) {
    onChange(opt.value);
    setOpen(false);
  }

  async function handleCreate() {
    if (!onCreateOption || !trimmedQuery || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const opt = await onCreateOption(trimmedQuery);
      if (opt) {
        onChange(opt.value);
        setOpen(false);
      } else {
        setCreateError('No se pudo crear.');
      }
    } catch {
      setCreateError('No se pudo crear.');
    } finally {
      setCreating(false);
    }
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

            {searchable || creatable ? (
              <TextInput
                style={styles.search}
                placeholder={creatable ? 'Buscar o escribir una nueva...' : 'Buscar...'}
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setCreateError(null);
                }}
                autoCorrect={false}
              />
            ) : null}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {showCreateRow ? (
                <Pressable style={[styles.row, styles.createRow]} onPress={handleCreate} disabled={creating}>
                  {creating ? (
                    <ActivityIndicator size="small" color={colors.stamp} />
                  ) : (
                    <Text style={[styles.rowText, styles.createRowText]} numberOfLines={1}>
                      {`+ Crear "${trimmedQuery}"`}
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {filtered.length === 0 && !showCreateRow ? (
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

            {createError ? <Text style={styles.createError}>{createError}</Text> : null}

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
  // minHeight: ver comentario del mismo fix en PriceField.tsx.
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 2,
    minHeight: 28,
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
  createRow: { borderWidth: 1, borderColor: colors.stamp, borderStyle: 'dashed', marginBottom: 6 },
  createRowText: { color: colors.stamp, fontWeight: '600' },
  createError: { color: colors.stamp, fontSize: 12.5, marginTop: -4 },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeButtonText: { color: colors.inkSoft, fontWeight: '600' },
});
