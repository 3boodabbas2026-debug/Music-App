import { apiClient } from './client';
import type { Job } from './types';

export type TelegramStatus = {
  configured: boolean;
  authorized: boolean;
  phone: string | null;
};

export type TelegramDialog = {
  id: string;
  title: string;
  username: string | null;
};

export type LinkStepResult = { status: 'authorized' | 'code_sent' | 'password_required'; phone?: string };

export async function getStatus(): Promise<TelegramStatus> {
  const { data } = await apiClient.get<TelegramStatus>('/telegram/status');
  return data;
}

export async function saveSettings(apiId: number, apiHash: string, phone: string): Promise<TelegramStatus> {
  const { data } = await apiClient.post<TelegramStatus>('/telegram/settings', {
    api_id: apiId,
    api_hash: apiHash,
    phone,
  });
  return data;
}

export async function sendCode(): Promise<LinkStepResult> {
  const { data } = await apiClient.post<LinkStepResult>('/telegram/send-code');
  return data;
}

export async function verifyCode(code: string): Promise<LinkStepResult> {
  const { data } = await apiClient.post<LinkStepResult>('/telegram/verify-code', { code });
  return data;
}

export async function verifyPassword(password: string): Promise<LinkStepResult> {
  const { data } = await apiClient.post<LinkStepResult>('/telegram/verify-password', { password });
  return data;
}

export async function listDialogs(): Promise<TelegramDialog[]> {
  const { data } = await apiClient.get<TelegramDialog[]>('/telegram/dialogs');
  return data;
}

export async function startImport(chat: string, mediaKind: 'music' | 'video', limit: number): Promise<Job> {
  const { data } = await apiClient.post<Job>('/telegram/import', { chat, media_kind: mediaKind, limit });
  return data;
}
