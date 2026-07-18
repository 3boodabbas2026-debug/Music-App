import { create } from 'zustand';

import * as authApi from '../services/api/auth';
import { invalidateApiSession, setAuthenticationExpiredHandler } from '../services/api/client';
import { accountStorage, type RememberedAccount } from '../services/storage/accountStorage';
import { tokenStorage } from '../services/storage/tokenStorage';
import { resetSessionStores } from './sessionStoreReset';
import { toast } from './toastStore';
import type { StoragePreference, User } from '../services/api/types';

type AuthState = {
  user: User | null;
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  /** True when the session was restored from local cache because the network/API was unreachable — not a rejected token. */
  isOfflineSession: boolean;
  rememberedAccounts: RememberedAccount[];
  pendingAccountEmail: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  startAccountSwitch: (email?: string) => Promise<void>;
  forgetAccount: (userId: string) => Promise<void>;
  setStoragePreference: (preference: StoragePreference) => Promise<void>;
  updateProfile: (displayName: string, email: string, currentPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
};

/** True only for a genuine "this token is invalid" rejection — never for "we couldn't reach the server". */
function isAuthRejection(error: any): boolean {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  isAuthenticated: false,
  isOfflineSession: false,
  rememberedAccounts: [],
  pendingAccountEmail: null,

  async bootstrap() {
    const rememberedAccounts = await accountStorage.list();
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      set({ rememberedAccounts, isBootstrapping: false });
      return;
    }
    try {
      // Bounded well below the client's default 30s timeout: this is really just an
      // "are we online" probe on boot, and a genuinely offline app open should resolve
      // into the cached session in a couple of seconds, not stall on a boot screen.
      const user = await authApi.me({ timeoutMs: 6000 });
      await tokenStorage.setCachedUser(user);
      const accounts = await accountStorage.remember(user);
      set({ user, rememberedAccounts: accounts, isAuthenticated: true, isOfflineSession: false, isBootstrapping: false });
    } catch (error) {
      if (isAuthRejection(error)) {
        // The server actively rejected this token — it really is invalid/expired.
        await Promise.all([tokenStorage.clear(), resetSessionStores()]);
        set({ rememberedAccounts, isBootstrapping: false });
        return;
      }
      // Network/backend unreachable: trust the token that's already on disk and
      // open into the app using the last-known profile, instead of bouncing to
      // the login screen every time the app opens offline.
      const cachedUser = await tokenStorage.getCachedUser();
      set({ user: cachedUser, rememberedAccounts, isAuthenticated: true, isOfflineSession: true, isBootstrapping: false });
    }
  },

  async login(email, password) {
    const result = await authApi.login(email, password);
    invalidateApiSession();
    await resetSessionStores();
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    await tokenStorage.setCachedUser(result.user);
    const rememberedAccounts = await accountStorage.remember(result.user);
    set({
      user: result.user,
      rememberedAccounts,
      pendingAccountEmail: null,
      isAuthenticated: true,
      isOfflineSession: false,
    });
  },

  async register(email, password, displayName, inviteCode) {
    const result = await authApi.register(email, password, displayName, inviteCode);
    invalidateApiSession();
    await resetSessionStores();
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    await tokenStorage.setCachedUser(result.user);
    const rememberedAccounts = await accountStorage.remember(result.user);
    set({
      user: result.user,
      rememberedAccounts,
      pendingAccountEmail: null,
      isAuthenticated: true,
      isOfflineSession: false,
    });
  },

  async logout() {
    invalidateApiSession();
    await Promise.all([tokenStorage.clear(), resetSessionStores()]);
    set({ user: null, pendingAccountEmail: null, isAuthenticated: false, isOfflineSession: false });
  },

  async startAccountSwitch(email = '') {
    invalidateApiSession();
    await Promise.all([tokenStorage.clear(), resetSessionStores()]);
    set({
      user: null,
      pendingAccountEmail: email,
      isAuthenticated: false,
      isOfflineSession: false,
    });
  },

  async forgetAccount(userId) {
    const rememberedAccounts = await accountStorage.forget(userId);
    set({ rememberedAccounts });
  },

  async setStoragePreference(preference) {
    const updated = await authApi.updateStoragePreference(preference);
    await tokenStorage.setCachedUser(updated);
    set({ user: updated });
  },

  async updateProfile(displayName, email, currentPassword) {
    const updated = await authApi.updateProfile({ displayName, email, currentPassword });
    await tokenStorage.setCachedUser(updated);
    const rememberedAccounts = await accountStorage.remember(updated);
    set({ user: updated, rememberedAccounts });
  },

  async changePassword(currentPassword, newPassword) {
    await authApi.changePassword(currentPassword, newPassword);
  },

  async deleteAccount(currentPassword) {
    await authApi.deleteAccount(currentPassword);
    invalidateApiSession();
    await Promise.all([tokenStorage.clear(), resetSessionStores()]);
    set({ user: null, pendingAccountEmail: null, isAuthenticated: false, isOfflineSession: false });
  },
}));

setAuthenticationExpiredHandler(() => {
  invalidateApiSession();
  void resetSessionStores();
  useAuthStore.setState({ user: null, pendingAccountEmail: null, isAuthenticated: false, isOfflineSession: false, isBootstrapping: false });
  toast('Your session expired. Log in to keep listening.', 'info');
});
