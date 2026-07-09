import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Tactile feedback for the transport controls — expo-haptics is a silent
 * no-op on web, so these are safe to call from any platform without a guard
 * at the call site. Native only, since web has no haptics API to fall back to.
 */
export const haptics = {
  tap(): void {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  toggle(): void {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success(): void {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
