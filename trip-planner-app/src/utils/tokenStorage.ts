import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'auth_token';

// expo-secure-store es nativo puro (Keychain en iOS, Keystore en Android):
// no tiene implementación para web y sus funciones directamente no existen
// ahí. Este wrapper elige el storage correcto según la plataforma para que
// el resto de la app (client.ts) no tenga que preocuparse por eso.
//
// Nota: localStorage no es tan seguro como SecureStore (accesible por JS
// del mismo origen), pero es la opción estándar para web. Si en algún
// momento esto va a producción, lo ideal en web es manejar la sesión con
// una cookie httpOnly seteada por el backend en vez de guardar el JWT acá.

export async function getStoredToken(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setStoredToken(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteStoredToken(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
