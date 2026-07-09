import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Recognize: undefined;
  Library: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Player: undefined;
  Telegram: undefined;
  Jobs: undefined;
  Settings: undefined;
  Replay: undefined;
};
