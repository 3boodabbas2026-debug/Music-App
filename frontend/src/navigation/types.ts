import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type LibraryTab = 'all' | 'audio' | 'video' | 'favorites' | 'categories' | 'playlists';

export type MainTabParamList = {
  Home: undefined;
  Library: { tab?: LibraryTab; query?: string; selectId?: string } | undefined;
  Recognize: undefined;
  Activity: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Player: { panel?: 'queue' } | undefined;
  Telegram: undefined;
  Jobs: undefined;
  Settings: undefined;
  Replay: undefined;
  Admin: undefined;
};
