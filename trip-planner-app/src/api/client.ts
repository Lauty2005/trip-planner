import axios from 'axios';
import { getStoredToken, setStoredToken, deleteStoredToken, AUTH_TOKEN_KEY } from '@/utils/tokenStorage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TOKEN_KEY = AUTH_TOKEN_KEY;

if (!API_URL) {
  console.warn('EXPO_PUBLIC_API_URL no está definida — revisá tu .env');
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Adjunta el JWT guardado (si existe) a cada request.
apiClient.interceptors.request.use(async (config) => {
  const token = await getStoredToken(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el backend devuelve 401, limpiamos el token guardado.
// La redirección a /login la maneja la pantalla que llama esto.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await deleteStoredToken(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export async function saveAuthToken(token: string) {
  await setStoredToken(TOKEN_KEY, token);
}

export async function clearAuthToken() {
  await deleteStoredToken(TOKEN_KEY);
}
