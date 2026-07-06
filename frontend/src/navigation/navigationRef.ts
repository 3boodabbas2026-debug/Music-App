import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/** Shared ref so overlays outside the navigator tree (e.g. the sidebar) can navigate. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
