import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { PressableScale } from './PressableScale';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { colors, radii, typography } from '../../theme/tokens';

/** Gradient avatar button that opens the sidebar — one per main screen header. */
export function SidebarTrigger({ size = 42 }: { size?: number }) {
  const openSidebar = useUiStore((s) => s.openSidebar);
  const user = useAuthStore((s) => s.user);
  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0] ?? '♪').toUpperCase();

  return (
    <PressableScale onPress={openSidebar} scaleTo={0.9} hitSlop={8}>
      <LinearGradient
        colors={colors.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.avatar, { width: size, height: size }]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  initial: {
    ...typography.title,
    color: '#0B1120',
  },
});
