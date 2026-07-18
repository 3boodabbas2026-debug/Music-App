import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, glass, radii, spacing, stateLayers, typography } from '../../theme/tokens';

function lastUpdatedLabel(value: string | null): string {
  if (!value) return 'Last successful update is unknown.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Last successful update is unknown.';
  return `Last updated ${date.toLocaleString()}.`;
}

export function LibraryFreshnessBanner({
  stale,
  lastUpdatedAt,
  refreshing,
  onRetry,
}: {
  stale: boolean;
  lastUpdatedAt: string | null;
  refreshing: boolean;
  onRetry: () => void;
}) {
  if (!stale) return null;
  return (
    <ConnectionSignal
      title="Showing your saved library"
      detail="Couldn’t reach Star Hollow. Saved data is still usable."
      timestamp={lastUpdatedLabel(lastUpdatedAt)}
      actionLabel={refreshing ? 'Retrying' : 'Retry'}
      actionAccessibilityLabel="Retry library refresh"
      loading={refreshing}
      onAction={onRetry}
    />
  );
}

export function ConnectionSignal({
  title,
  detail,
  timestamp,
  actionLabel,
  actionAccessibilityLabel,
  loading = false,
  onAction,
  compact = false,
  icon = 'cloud-offline-outline',
}: {
  title: string;
  detail: string;
  timestamp?: string;
  actionLabel?: string;
  actionAccessibilityLabel?: string;
  loading?: boolean;
  onAction?: () => void;
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, compact && styles.bannerCompact]}
    >
      <View pointerEvents="none" style={styles.edge} />
      <View style={styles.iconWell}>
        <Ionicons name={icon} size={18} color={colors.warning} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
        {timestamp ? <Text style={styles.timestamp}>{timestamp}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          accessibilityState={{ disabled: loading, busy: loading }}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed, loading && styles.retryDisabled]}
        >
          {loading ? <ActivityIndicator size="small" color={colors.warning} /> : <Ionicons name="refresh" size={16} color={colors.warning} />}
          <Text style={styles.retryLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: stateLayers.warning.stroke,
    backgroundColor: glass.fillHeavy,
  },
  bannerCompact: { paddingVertical: spacing.sm, marginBottom: 0 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.warning },
  iconWell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: stateLayers.warning.fill,
    borderWidth: 1,
    borderColor: stateLayers.warning.stroke,
  },
  copy: { flex: 1, minWidth: 180 },
  title: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textMuted },
  timestamp: { ...typography.metadata, marginTop: 2, fontSize: 10, color: colors.warning },
  retry: {
    minWidth: 88,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: stateLayers.warning.fill,
    borderWidth: 1,
    borderColor: stateLayers.warning.stroke,
  },
  retryPressed: { backgroundColor: glass.fillBright, borderColor: colors.warning },
  retryDisabled: { backgroundColor: glass.fillDeep, borderColor: glass.stroke },
  retryLabel: { ...typography.subtitle, fontSize: 12, color: colors.warning },
});
