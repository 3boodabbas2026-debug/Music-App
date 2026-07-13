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

export type TelegramFolder = {
  id: number;
  title: string;
  chat_count: number;
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

export async function disconnect(): Promise<TelegramStatus> {
  const { data } = await apiClient.delete<TelegramStatus>('/telegram/connection');
  return data;
}

export async function listDialogs(): Promise<TelegramDialog[]> {
  const { data } = await apiClient.get<TelegramDialog[]>('/telegram/dialogs');
  return data;
}

export async function listFolders(): Promise<TelegramFolder[]> {
  const { data } = await apiClient.get<TelegramFolder[]>('/telegram/folders');
  return data;
}

export type ImportTarget = { chats: string[] } | { folderId: number };

export async function startImport(
  target: ImportTarget,
  mediaKind: 'music' | 'video',
  limit: number | null,
): Promise<Job> {
  const body =
    'folderId' in target
      ? { folder_id: target.folderId, media_kind: mediaKind, limit }
      : { chats: target.chats, media_kind: mediaKind, limit };
  const { data } = await apiClient.post<Job>('/telegram/import', body);
  return data;
}
