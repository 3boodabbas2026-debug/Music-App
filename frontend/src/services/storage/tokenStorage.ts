import AsyncStorage from '@react-native-async-storage/async-storage';

import type { User } from '../api/types';

const ACCESS_KEY = 'sma.accessToken';
const REFRESH_KEY = 'sma.refreshToken';
const USER_KEY = 'sma.cachedUser';

// In-memory mirror of the access token. Hot paths (opening a video builds a
// tokenized stream URL) shouldn't pay an AsyncStorage round trip on every
// call — undefined means "not loaded yet", null means "signed out".
let accessTokenCache: string | null | undefined;

export const tokenStorage = {
  async getAccessToken() {
    if (accessTokenCache === undefined) {
      accessTokenCache = await AsyncStorage.getItem(ACCESS_KEY);
    }
    return accessTokenCache;
  },
  async getRefreshToken() {
    return AsyncStorage.getItem(REFRESH_KEY);
  },
  async setTokens(accessToken: string, refreshToken: string) {
    accessTokenCache = accessToken;
    await AsyncStorage.multiSet([
      [ACCESS_KEY, accessToken],
      [REFRESH_KEY, refreshToken],
    ]);
  },
  async setAccessToken(accessToken: string) {
    accessTokenCache = accessToken;
    await AsyncStorage.setItem(ACCESS_KEY, accessToken);
  },
  /** Last-known signed-in profile, so a session can be restored offline without a round trip to /auth/me. */
  async getCachedUser(): Promise<User | null> {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  async setCachedUser(user: User) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  async clear() {
    accessTokenCache = null;
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, USER_KEY]);
  },
};
