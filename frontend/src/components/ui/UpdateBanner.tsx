import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { UpdateInfo } from '../../hooks/useAppUpdate';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

export function UpdateBanner({ update, onDismiss }: { update: UpdateInfo; onDismiss: () => void }) {
  return (
    <View style={styles.card}>
      <Ionicons name="sparkles" size={18} color={colors.cyan} />
      <View style={styles.textCol}>
        <Text style={styles.title}>{update.title}</Text>
        <Text style={styles.detail}>{update.detail}</Text>
      </View>
      <Pressable onPress={update.apply} style={styles.actionButton} hitSlop={8}>
        <Text style={styles.actionText}>{update.actionLabel}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityLabel="Dismiss update" style={styles.dismiss} hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: glass.fillHeavy, borderRadius: radii.md, borderWidth: 1,
    borderColor: glass.tintPrimaryStroke, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  textCol: { flex: 1, gap: 1 },
  title: { ...typography.body, fontSize: 13, fontFamily: 'Sora_600SemiBold', color: colors.textPrimary },
  detail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  actionButton: { backgroundColor: colors.cyan, borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 12 },
  actionText: { fontFamily: 'Sora_600SemiBold', fontSize: 12, color: colors.textInverse },
  dismiss: { padding: 2 },
});
