import { apiClient } from './client';
import type { StoragePreference, User } from './types';

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
};

export async function register(
  email: string,
  password: string,
  displayName: string,
  inviteCode?: string,
): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/register', {
    email,
    password,
    display_name: displayName,
    invite_code: inviteCode || undefined,
  });
  return data;
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>('/auth/login', { email, password });
  return data;
}

export async function me(options?: { timeoutMs?: number }): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me', options?.timeoutMs ? { timeout: options.timeoutMs } : undefined);
  return data;
}

export async function updateStoragePreference(preference: StoragePreference): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/me/settings', { storage_preference: preference });
  return data;
}

/** Endpoint-ready auth calls. The current backend has not shipped these routes yet. */
export async function requestPasswordRecovery(email: string): Promise<void> {
  await apiClient.post('/auth/password/recovery', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/password/reset', { token, new_password: newPassword });
}

export async function updateProfile(input: { displayName: string; email: string; currentPassword: string }): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/me/profile', {
    display_name: input.displayName,
    email: input.email,
    current_password: input.currentPassword,
  });
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/me/password', { current_password: currentPassword, new_password: newPassword });
}

export async function deleteAccount(currentPassword: string): Promise<void> {
  await apiClient.delete('/auth/me', { data: { current_password: currentPassword, confirmation: 'DELETE' } });
}
