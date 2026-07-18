import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Announcement } from '../../services/api/admin';
import { colors, glass, radii, shadows, spacing, typography } from '../../theme/tokens';

export function AnnouncementBanner({ announcement, onDismiss }: { announcement: Announcement; onDismiss: () => void }) {
  return (
    <View style={styles.card}>
      <Ionicons name="megaphone" size={18} color={colors.cyan} />
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
    width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: glass.fillHeavy, borderRadius: radii.md, borderWidth: 1,
    borderColor: glass.tintPrimaryStroke, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  textCol: { flex: 1, gap: 1 },
  title: { ...typography.body, fontSize: 13, fontFamily: 'Sora_600SemiBold', color: colors.textPrimary },
  detail: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  dismiss: { padding: 2 },
});
