import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  DEFAULT_ORDER,
  WIDGET_META,
  useDashboardStore,
  type WidgetId,
} from '../../store/dashboardStore';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { IconButton } from '../ui/IconButton';
import { SegmentedControl } from '../ui/SegmentedControl';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The dashboard's edit surface: show/hide widgets, nudge them up or down,
 * and pick the layout density and accent mood. Rendered as an overlay card
 * (bottom sheet on phones) rather than a separate screen so changes are
 * visible behind it the moment they're made.
 */
export function DashboardCustomizer({ visible, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const order = useDashboardStore((s) => s.order);
  const hidden = useDashboardStore((s) => s.hidden);
  const density = useDashboardStore((s) => s.density);
  const accent = useDashboardStore((s) => s.accent);
  const toggleWidget = useDashboardStore((s) => s.toggleWidget);
  const moveWidget = useDashboardStore((s) => s.moveWidget);
  const setDensity = useDashboardStore((s) => s.setDensity);
  const setAccent = useDashboardStore((s) => s.setAccent);
  const reset = useDashboardStore((s) => s.reset);

  useEscapeToClose(visible, onClose);

  if (!visible) return null;

  const isWide = width >= 720;

  function renderRow(id: WidgetId, index: number) {
    const meta = WIDGET_META[id];
    const isHidden = hidden.includes(id);
    return (
      <View key={id} style={[styles.row, isHidden && styles.rowHidden]}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{meta.label}</Text>
          <Text numberOfLines={1} style={styles.rowDescription}>{meta.description}</Text>
        </View>
        <IconButton
          icon="chevron-up"
          accessibilityLabel={`Move ${meta.label} up`}
          variant="surface"
          size={48}
          iconSize={20}
          disabled={index === 0}
          onPress={() => moveWidget(id, -1)}
        />
        <IconButton
          icon="chevron-down"
          accessibilityLabel={`Move ${meta.label} down`}
          variant="surface"
          size={48}
          iconSize={20}
          disabled={index === order.length - 1}
          onPress={() => moveWidget(id, 1)}
        />
        <Switch
          value={!isHidden}
          onValueChange={() => toggleWidget(id)}
          accessibilityLabel={`Show ${meta.label} widget`}
          trackColor={{ false: colors.surfaceElevated, true: colors.cyan }}
          thumbColor={colors.textPrimary}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close dashboard settings" />
      <View
        style={[
          styles.card,
          isWide
            ? { width: 520, alignSelf: 'center', top: Math.max(48, height * 0.08), maxHeight: height * 0.84 }
            : { left: spacing.sm, right: spacing.sm, bottom: 0, maxHeight: height * 0.88, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>YOUR DASHBOARD</Text>
            <Text style={styles.title}>Arrange your hollow</Text>
          </View>
          <IconButton icon="close" accessibilityLabel="Done customizing" onPress={onClose} />
        </View>

        <View style={[styles.preferences, isWide && styles.preferencesWide]}>
          <View style={styles.preferenceGroup}>
            <Text style={styles.sectionLabel}>LAYOUT</Text>
            <SegmentedControl
              options={[
                { value: 'spacious', label: 'Spacious', icon: 'resize-outline' },
                { value: 'compact', label: 'Compact', icon: 'contract-outline' },
              ]}
              value={density}
              onChange={setDensity}
              accessibilityLabel="Dashboard density"
            />
          </View>

          <View style={styles.preferenceGroup}>
            <Text style={styles.sectionLabel}>ACCENT</Text>
            <SegmentedControl
              options={[
                { value: 'forest', label: 'Forest Night', icon: 'leaf-outline' },
                { value: 'cosmic', label: 'Cosmic Night', icon: 'planet-outline' },
              ]}
              value={accent}
              onChange={setAccent}
              accessibilityLabel="Dashboard accent"
            />
          </View>
        </View>

        <ScrollView style={styles.widgetScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>WIDGETS</Text>
          <View style={styles.rows}>{order.map(renderRow)}</View>

          <Pressable
            onPress={reset}
            accessibilityRole="button"
            accessibilityLabel="Reset dashboard layout"
            style={({ pressed }) => [styles.resetRow, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
            <Text style={styles.resetLabel}>Reset to default layout</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

// Referenced so a future widget forgetting WIDGET_META fails the typecheck here, near the UI that needs it.
const _exhaustive: readonly WidgetId[] = DEFAULT_ORDER;
void _exhaustive;

const styles = StyleSheet.create({
  backdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(3,7,6,0.66)' },
  card: {
    position: 'absolute',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  headerText: { flex: 1 },
  eyebrow: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 2, color: colors.cyan },
  title: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  preferences: { gap: spacing.sm, marginBottom: spacing.md },
  preferencesWide: { flexDirection: 'row', gap: spacing.md },
  preferenceGroup: { flex: 1 },
  widgetScroll: { flexShrink: 1 },
  scroll: { paddingBottom: spacing.md },
  sectionLabel: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 1.8, color: colors.textMuted, marginBottom: spacing.sm },
  rows: { gap: 2 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 0,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  rowHidden: { opacity: 0.55 },
  rowText: { flex: 1, marginRight: spacing.xs },
  rowLabel: { ...typography.subtitle, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  rowDescription: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  resetRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  resetLabel: { ...typography.caption, fontFamily: 'Sora_500Medium', color: colors.textMuted },
  pressed: { opacity: 0.7 },
});
