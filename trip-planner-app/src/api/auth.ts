import { apiClient } from './client';

export async function register(payload: { email: string; password: string; name: string }) {
  const { data } = await apiClient.post('/auth/register', payload);
  return data as { token: string; user: { id: string; email: string; name: string } };
}

export async function login(email: string, password: string) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data as { token: string; user: { id: string; email: string; name: string } };
}

export interface Me {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get('/auth/me');
  return data;
}
