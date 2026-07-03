import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { register } from '@/api/auth';
import { saveAuthToken } from '@/api/client';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';

// Registro — antes usaba colores Material hardcodeados. Ahora usa la
// identidad "Rumbo" del resto de la app.

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      setError('Completá nombre, email y contraseña.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await register({ name, email, password });
      await saveAuthToken(token);
      router.replace('/(tabs)');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo crear la cuenta.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          ViajaYa<Text style={styles.brandDot}>.</Text>
        </Text>
      </View>
      <Text style={styles.eyebrow}>EMPECEMOS A PLANEAR</Text>
      <Text style={styles.title}>Crear cuenta</Text>

      <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={handleRegister} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Creando...' : 'Crear cuenta'}</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/(auth)/login')}>
        <Text style={styles.link}>Ya tengo cuenta, iniciar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.containerPadding,
    gap: spacing.stackSm,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: layout.formMaxWidth,
    alignSelf: 'center',
  },
  brandRow: { alignItems: 'center', marginBottom: spacing.stackLg },
  brand: { fontFamily: fonts.displaySemibold, fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  brandDot: { color: colors.stamp },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11.5, letterSpacing: tracking.eyebrow, textTransform: 'uppercase', color: colors.muted },
  title: { fontFamily: fonts.displaySemibold, fontSize: 24, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  error: { color: colors.stamp },
  button: { backgroundColor: colors.ink, borderRadius: radius.sm, padding: 14, alignItems: 'center', ...cardShadow },
  buttonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600' },
  link: { color: colors.ink, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
