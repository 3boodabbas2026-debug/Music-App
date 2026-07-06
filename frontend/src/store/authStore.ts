import { create } from 'zustand';

import * as authApi from '../services/api/auth';
import { tokenStorage } from '../services/storage/tokenStorage';
import type { User } from '../services/api/types';

type AuthState = {
  user: User | null;
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  isAuthenticated: false,

  async bootstrap() {
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      set({ isBootstrapping: false });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isBootstrapping: false });
    } catch {
      await tokenStorage.clear();
      set({ isBootstrapping: false });
    }
  },

  async login(email, password) {
    const result = await authApi.login(email, password);
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    set({ user: result.user, isAuthenticated: true });
  },

  async register(email, password, displayName, inviteCode) {
    const result = await authApi.register(email, password, displayName, inviteCode);
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    set({ user: result.user, isAuthenticated: true });
  },

  async logout() {
    await tokenStorage.clear();
    set({ user: null, isAuthenticated: false });
  },
}));
