import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { UpdateInfo } from '../../hooks/useAppUpdate';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

export function UpdateBanner({ update, onDismiss }: { update: UpdateInfo; onDismiss: () => void }) {
  return (
    <View role="status" accessibilityLiveRegion="polite" style={styles.card}>
      <View pointerEvents="none" style={styles.edge} />
      <View style={styles.iconWell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="sparkles" size={17} color={colors.cyan} />
      </View>
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
    position: 'relative', overflow: 'hidden', width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm,
    backgroundColor: glass.fillHeavy, borderRadius: radii.md, borderWidth: 1,
    borderColor: glass.tintPrimaryStroke, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.cyan },
  iconWell: { width: 34, height: 34, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  textCol: { flex: 1, gap: 1 },
  title: { ...typography.body, fontSize: 13, fontFamily: 'Sora_600SemiBold', color: colors.textPrimary },
  detail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  actionButton: { minHeight: 34, justifyContent: 'center', backgroundColor: glass.tintPrimary, borderRadius: radii.sm, borderWidth: 1, borderColor: glass.tintPrimaryStroke, paddingVertical: 6, paddingHorizontal: 12 },
  actionText: { fontFamily: 'Sora_600SemiBold', fontSize: 12, color: colors.cyan },
  dismiss: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fillDeep, borderWidth: 1, borderColor: glass.stroke },
});
