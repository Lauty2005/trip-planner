import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fonts, tracking } from '@/theme';

// Equivalente web de SelectField.tsx: en vez del modal a medida, un
// <select> nativo del navegador (menú desplegable real del sistema
// operativo/navegador — más acorde a como se usa un selector en web).
// 'select'/'option' as any porque los tipos de @types/react-native no
// declaran JSX.IntrinsicElements para etiquetas HTML crudas; mismo
// escape hatch que ya usan TripMapPreview.web.tsx/map.web.tsx (ahí con
// document.createElement en vez de JSX). Este archivo solo se bundlea
// para web (sufijo .web.tsx), así que en nativo nunca se evalúa.
const HtmlSelect = 'select' as any;
const HtmlOption = 'option' as any;

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
}: {
  glyph: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  searchable?: boolean;
}) {
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
});
