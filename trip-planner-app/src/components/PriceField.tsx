import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radius, fonts, tracking } from '@/theme';

// Campo numérico para precios — inspirado en componentes tipo `InputNumber`
// (Ant Design y similares): separador de miles en vivo y hasta 2 decimales,
// sin sumar ninguna librería nueva. Mismo <TextInput> de siempre, pero con
// formateo manual vía toLocaleString('es-AR') mientras el usuario tipea y
// un valor numérico (`number | undefined`) hacia afuera, no un string.
//
// No hace falta split .web.tsx acá: es un TextInput de React Native común,
// funciona igual en nativo y en web (a diferencia de SelectField/TimePickerField
// que sí necesitan el <select>/<input type="time"> real del navegador).

const MAX_DECIMALS = 2;

function formatDisplay(raw: string): string {
  // raw solo contiene dígitos y a lo sumo una coma (separador decimal es-AR).
  const [intPart, decPart] = raw.split(',');
  const intFormatted = intPart ? Number(intPart).toLocaleString('es-AR') : '';
  if (decPart === undefined) return intFormatted;
  return `${intFormatted},${decPart.slice(0, MAX_DECIMALS)}`;
}

function sanitize(text: string): string {
  // El punto SIEMPRE es el separador de miles que agrega formatDisplay
  // (nunca algo que el usuario "tipeó" con intención decimal), así que se
  // descarta directo. Antes se lo convertía en coma decimal, lo que hacía
  // que "1.000" (ya formateado) se releyera como "1,000" — un decimal de
  // 3 dígitos — y al recortarse a 2 decimales el campo "se comía" todo lo
  // que se tipeaba después del tercer dígito. La coma sigue siendo el
  // único separador decimal real.
  let cleaned = text.replace(/\./g, '').replace(/[^0-9,]/g, '');
  const firstComma = cleaned.indexOf(',');
  if (firstComma !== -1) {
    cleaned = cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, '');
  }
  return cleaned;
}

function toNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function numberToRaw(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '';
  return String(n).replace('.', ',');
}

export function PriceField({
  glyph,
  label,
  placeholder = '0,00',
  value,
  onChange,
}: {
  glyph: string;
  label: string;
  placeholder?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  // raw = lo que el usuario está tipeando (solo dígitos + coma), se
  // resincroniza con `value` cuando el campo no tiene foco.
  const [raw, setRaw] = useState(numberToRaw(value));
  const [focused, setFocused] = useState(false);

  function handleChangeText(text: string) {
    const cleaned = sanitize(text);
    setRaw(cleaned);
    onChange(toNumber(cleaned));
  }

  function handleFocus() {
    setFocused(true);
  }

  function handleBlur() {
    setFocused(false);
    // Al perder el foco, resincroniza `raw` con el valor numérico real
    // (por si el usuario dejó una coma colgando tipo "1200,").
    setRaw(numberToRaw(value));
  }

  const displayValue = focused ? formatDisplay(raw) : raw ? formatDisplay(raw) : '';

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // minHeight: mismo fix que Field/SelectField/DatePickerField/TimePickerField
  // (ver comentario en app/(tabs)/explore.tsx) — reserva 2 líneas de alto
  // aunque el label entre en una sola, para que el fieldBox de este campo
  // arranque a la misma altura que el de al lado en una fieldRow, sin
  // importar cuál de los dos labels es más largo.
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
    // paddingVertical en la caja, no en el TextInput — ver comentario en
    // app/(tabs)/explore.tsx (mismo fix de alineación, es el mismo bug de
    // altura entre <TextInput> y <Text>+Pressable en react-native-web).
    paddingVertical: 12,
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.ink },
});
