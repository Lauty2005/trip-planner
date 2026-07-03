import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { getStoredToken, AUTH_TOKEN_KEY } from '@/utils/tokenStorage';
import { colors, fonts } from '@/theme';

// Guard de autenticación: en cada cambio de ruta revisa si hay un token
// guardado y redirige según corresponda. Se re-chequea en cada navegación
// (no solo al montar) para que el login y el logout disparen la
// redirección correcta sin quedar con un estado viejo en memoria.
export default function RootLayout() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const token = await getStoredToken(AUTH_TOKEN_KEY);
      const inAuthGroup = segments[0] === '(auth)';

      if (!token && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (token && inAuthGroup) {
        router.replace('/(tabs)');
      }
      setChecking(false);
    })();
  }, [segments]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Ojo: NO poner headerShown:false en screenOptions del Stack raíz. Eso se
  // hereda a TODAS las rutas hijas, incluidas trip/[tripId] y new-trip (que
  // expo-router registra automáticamente por convención de archivos aunque
  // no tengan <Stack.Screen> explícito acá) — dejaba esas pantallas sin
  // header ni botón de volver, así que una vez adentro no había forma de
  // salir. Ocultamos el header solo donde corresponde ((auth) y (tabs)
  // dibujan el suyo propio) y dejamos el default (header visible, con back)
  // para el resto.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.white,
        headerTitleStyle: { fontFamily: fonts.displaySemibold, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
