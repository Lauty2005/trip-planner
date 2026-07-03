import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fonts, tracking } from '@/theme';

// Equivalente web de TimePickerField.tsx: en vez de las dos columnas
// scrolleables del modal nativo, el <input type="time"> real del
// navegador (con su propio selector de reloj del sistema operativo).
// 'input' as any: mismo escape hatch que SelectField.web.tsx ('select'/
// 'option' as any) — los tipos de @types/react-native no declaran
// JSX.IntrinsicElements para etiquetas HTML crudas. Solo se bundlea para
// web (sufijo .web.tsx).
const HtmlInput = 'input' as any;

export function TimePickerField({
  glyph,
  label,
  value,
  onChange,
}: {
  glyph: string;
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <HtmlInput
          type="time"
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={inputStyle}
        />
      </View>
    </View>
  );
}

const inputStyle: Record<string, string | number> = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 16,
  color: colors.ink,
  paddingTop: 12,
  paddingBottom: 12,
  width: '100%',
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
