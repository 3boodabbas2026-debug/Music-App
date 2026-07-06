import { apiClient } from './client';
import type { User } from './types';

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

export async function me(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me');
  return data;
}
