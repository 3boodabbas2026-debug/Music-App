import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_KEY = 'sma.accessToken';
const REFRESH_KEY = 'sma.refreshToken';

export const tokenStorage = {
  async getAccessToken() {
    return AsyncStorage.getItem(ACCESS_KEY);
  },
  async getRefreshToken() {
    return AsyncStorage.getItem(REFRESH_KEY);
  },
  async setTokens(accessToken: string, refreshToken: string) {
    await AsyncStorage.multiSet([
      [ACCESS_KEY, accessToken],
      [REFRESH_KEY, refreshToken],
    ]);
  },
  async setAccessToken(accessToken: string) {
    await AsyncStorage.setItem(ACCESS_KEY, accessToken);
  },
  async clear() {
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  },
};
