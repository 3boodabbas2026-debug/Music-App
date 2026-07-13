import { create } from 'zustand';

import * as authApi from '../services/api/auth';
import { setAuthenticationExpiredHandler } from '../services/api/client';
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
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  setStoragePreference: (preference: StoragePreference) => Promise<void>;
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

  async bootstrap() {
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      set({ isBootstrapping: false });
      return;
    }
    try {
      // Bounded well below the client's default 30s timeout: this is really just an
      // "are we online" probe on boot, and a genuinely offline app open should resolve
      // into the cached session in a couple of seconds, not stall on a boot screen.
      const user = await authApi.me({ timeoutMs: 6000 });
      await tokenStorage.setCachedUser(user);
      set({ user, isAuthenticated: true, isOfflineSession: false, isBootstrapping: false });
    } catch (error) {
      if (isAuthRejection(error)) {
        // The server actively rejected this token — it really is invalid/expired.
        await Promise.all([tokenStorage.clear(), resetSessionStores()]);
        set({ isBootstrapping: false });
        return;
      }
      // Network/backend unreachable: trust the token that's already on disk and
      // open into the app using the last-known profile, instead of bouncing to
      // the login screen every time the app opens offline.
      const cachedUser = await tokenStorage.getCachedUser();
      set({ user: cachedUser, isAuthenticated: true, isOfflineSession: true, isBootstrapping: false });
    }
  },

  async login(email, password) {
    const result = await authApi.login(email, password);
    await resetSessionStores();
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    await tokenStorage.setCachedUser(result.user);
    set({ user: result.user, isAuthenticated: true, isOfflineSession: false });
  },

  async register(email, password, displayName, inviteCode) {
    const result = await authApi.register(email, password, displayName, inviteCode);
    await resetSessionStores();
    await tokenStorage.setTokens(result.access_token, result.refresh_token);
    await tokenStorage.setCachedUser(result.user);
    set({ user: result.user, isAuthenticated: true, isOfflineSession: false });
  },

  async logout() {
    await Promise.all([tokenStorage.clear(), resetSessionStores()]);
    set({ user: null, isAuthenticated: false, isOfflineSession: false });
  },

  async setStoragePreference(preference) {
    const updated = await authApi.updateStoragePreference(preference);
    await tokenStorage.setCachedUser(updated);
    set({ user: updated });
  },
}));

setAuthenticationExpiredHandler(() => {
  void resetSessionStores();
  useAuthStore.setState({ user: null, isAuthenticated: false, isOfflineSession: false, isBootstrapping: false });
  toast('Your session expired. Log in to keep listening.', 'info');
});
