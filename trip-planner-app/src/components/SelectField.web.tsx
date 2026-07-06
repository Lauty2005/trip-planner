import { useEffect, useId, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, fonts, tracking } from '@/theme';

// Equivalente web de SelectField.tsx: en vez del modal a medida, un
// <select> nativo del navegador (menú desplegable real del sistema
// operativo/navegador — más acorde a como se usa un selector en web).
// 'select'/'option'/etc as any porque los tipos de @types/react-native no
// declaran JSX.IntrinsicElements para etiquetas HTML crudas; mismo
// escape hatch que ya usan TripMapPreview.web.tsx/map.web.tsx (ahí con
// document.createElement en vez de JSX). Este archivo solo se bundlea
// para web (sufijo .web.tsx), así que en nativo nunca se evalúa.
const HtmlSelect = 'select' as any;
const HtmlOption = 'option' as any;
const HtmlInput = 'input' as any;
const HtmlDatalist = 'datalist' as any;

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
  onCreateOption?: (query: string) => Promise<SelectOption | null>;
}) {
  const selected = options.find((o) => o.value === value);
  const datalistId = useId();

  // Modo creatable (categoría de presupuesto en Reservas, 2026-07-06): el
  // <select> nativo no permite tipear texto libre, así que acá cambiamos a
  // <input list="..."> + <datalist> (autocompletado nativo del navegador)
  // — mismo criterio que la versión nativa: si lo tipeado matchea una
  // opción existente (case-insensitive) se selecciona esa sola; si no,
  // aparece un botón "+ Crear" que llama a onCreateOption (POST real).
  const [text, setText] = useState(selected?.label ?? '');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // También depende de `options` (no solo `value`): si el value ya viene
  // seteado (editando un hotel/vuelo) pero las categorías todavía no
  // terminaron de cargar, `selected` es undefined al montar — cuando
  // options llega, este efecto vuelve a correr y completa la etiqueta.
  useEffect(() => {
    setText(selected?.label ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  if (creatable) {
    const trimmed = text.trim();
    const matched = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    const showCreate = trimmed.length > 0 && !matched;

    async function handleCreate() {
      if (!onCreateOption || !trimmed || creating) return;
      setCreating(true);
      setCreateError(null);
      try {
        const opt = await onCreateOption(trimmed);
        if (opt) {
          onChange(opt.value);
          setText(opt.label);
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
        <View style={styles.fieldBox}>
          <Text style={styles.fieldGlyph}>{glyph}</Text>
          <HtmlInput
            list={datalistId}
            value={text}
            placeholder={placeholder}
            style={selectStyle}
            onChange={(e: any) => {
              const v = e.target.value;
              setText(v);
              setCreateError(null);
              const m = options.find((o) => o.label.toLowerCase() === v.trim().toLowerCase());
              onChange(m ? m.value : '');
            }}
          />
          <HtmlDatalist id={datalistId}>
            {options.map((opt) => (
              <HtmlOption key={opt.value} value={opt.label} />
            ))}
          </HtmlDatalist>
        </View>
        {showCreate ? (
          <Pressable style={styles.createRow} onPress={handleCreate} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={colors.stamp} />
            ) : (
              <Text style={styles.createRowText}>{`+ Crear "${trimmed}"`}</Text>
            )}
          </Pressable>
        ) : null}
        {createError ? <Text style={styles.createError}>{createError}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <HtmlSelect
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={selectStyle}
        >
          <HtmlOption value="" disabled>
            {placeholder}
          </HtmlOption>
          {options.map((opt) => (
            <HtmlOption key={opt.value} value={opt.value}>
              {opt.label}
            </HtmlOption>
          ))}
        </HtmlSelect>
      </View>
    </View>
  );
}

const selectStyle: Record<string, string | number> = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 16,
  color: colors.ink,
  paddingTop: 12,
  paddingBottom: 12,
  width: '100%',
  cursor: 'pointer',
};

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
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  createRow: { marginTop: 6, alignSelf: 'flex-start' },
  createRowText: { color: colors.stamp, fontWeight: '600', fontSize: 13.5 },
  createError: { color: colors.stamp, fontSize: 12.5, marginTop: 4 },
});
