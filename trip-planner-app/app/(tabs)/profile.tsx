import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { clearAuthToken } from '@/api/client';
import { getMe, type Me } from '@/api/auth';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';
import { AppHeader } from '@/components/AppHeader';

// Perfil — trae los datos reales del usuario logueado desde /auth/me y
// aplica la identidad visual "Rumbo" (papel + tinta navy + sello naranja)
// del resto de la app.

export default function ProfileScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await clearAuthToken();
    router.replace('/(auth)/login');
  }

  const initial = me?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={styles.pageRoot}>
      <AppHeader safeTop />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>MI CUENTA</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.ink} style={styles.spinner} />
        ) : me ? (
          <>
            <Text style={styles.name}>{me.name}</Text>
            <Text style={styles.email}>{me.email}</Text>
          </>
        ) : (
          <Text style={styles.email}>No se pudo cargar tu perfil.</Text>
        )}
      </View>

        <Pressable style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.containerPadding,
    gap: spacing.stackLg,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: spacing.stackSm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.stackLg,
    alignItems: 'center',
    gap: spacing.stackSm,
    ...cardShadow,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.stackSm,
  },
  avatarText: { fontFamily: fonts.displaySemibold, fontSize: 28, fontWeight: '700', color: colors.white },
  spinner: { marginVertical: spacing.stackSm },
  name: { fontFamily: fonts.displaySemibold, fontSize: 20, fontWeight: '700', color: colors.ink },
  email: { fontFamily: fonts.mono, fontSize: 13, color: colors.inkSoft },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 16 },
});
