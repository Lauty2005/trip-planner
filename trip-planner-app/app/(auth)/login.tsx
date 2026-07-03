import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { apiClient, saveAuthToken } from '@/api/client';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';

// Login — antes usaba colores Material hardcodeados (nunca se había
// migrado a theme.ts). Ahora usa la identidad "Rumbo" del resto de la app.

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      await saveAuthToken(data.token);
      router.replace('/(tabs)');
    } catch (err) {
      setError('Email o contraseña incorrectos');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          ViajaYa<Text style={styles.brandDot}>.</Text>
        </Text>
      </View>
      <Text style={styles.eyebrow}>BIENVENIDO DE VUELTA</Text>
      <Text style={styles.title}>Iniciar sesión</Text>

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
      <Pressable style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Entrar</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(auth)/register')}>
        <Text style={styles.link}>No tengo cuenta, crear una</Text>
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
