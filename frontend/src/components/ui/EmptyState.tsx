import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function EmptyState({ title, subtitle, icon = 'planet-outline' }: Props) {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['rgba(56,189,248,0.16)', 'rgba(129,140,248,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ring}
      >
        <View style={styles.ringInner}>
          <Ionicons name={icon} size={26} color={colors.cyan} />
        </View>
      </LinearGradient>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  ring: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    padding: 2,
    marginBottom: spacing.xs,
  },
  ringInner: {
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(6,11,24,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.subtitle, color: colors.textSecondary, textAlign: 'center' },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
});
