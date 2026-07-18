import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Announcement } from '../../services/api/admin';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

export function AnnouncementBanner({ announcement, onDismiss }: { announcement: Announcement; onDismiss: () => void }) {
  return (
    <View role="status" accessibilityLiveRegion="polite" style={styles.card}>
      <View pointerEvents="none" style={styles.edge} />
      <View style={styles.iconWell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="megaphone" size={17} color={colors.violet} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{announcement.title}</Text>
        <Text numberOfLines={3} style={styles.detail}>{announcement.body}</Text>
      </View>
      <Pressable onPress={onDismiss} accessibilityLabel="Dismiss announcement" style={styles.dismiss} hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative', overflow: 'hidden', width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: glass.fillHeavy, borderRadius: radii.md, borderWidth: 1,
    borderColor: glass.strokeStrong, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.violet },
  iconWell: { width: 34, height: 34, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,155,219,0.10)', borderWidth: 1, borderColor: 'rgba(169,155,219,0.28)' },
  textCol: { flex: 1, gap: 1 },
  title: { ...typography.body, fontSize: 13, fontFamily: 'Sora_600SemiBold', color: colors.textPrimary },
  detail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  dismiss: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fillDeep, borderWidth: 1, borderColor: glass.stroke },
});
