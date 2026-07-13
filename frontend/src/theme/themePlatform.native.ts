import { Appearance } from 'react-native';

import type { ThemeScheme } from './theme';

// Metro resolves this file on iOS/Android. The provider reloads the JS bundle
// after an explicit appearance change, so static StyleSheets are recreated
// from the correct literal palette.
export const supportsCssVariables = false;
export const initialThemeScheme: ThemeScheme = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
