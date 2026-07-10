import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type LibraryTab = 'all' | 'audio' | 'video' | 'favorites' | 'playlists';

export type MainTabParamList = {
  Home: undefined;
  Recognize: undefined;
  Library: { tab?: LibraryTab } | undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Player: undefined;
  Telegram: undefined;
  Jobs: undefined;
  Settings: undefined;
  Replay: undefined;
  Admin: undefined;
};
