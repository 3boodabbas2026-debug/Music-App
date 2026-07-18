import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  DEFAULT_ORDER,
  WIDGET_META,
  useDashboardStore,
  type WidgetId,
} from '../../store/dashboardStore';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { CompactGlassSheet } from '../ui/CompactGlassSheet';
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
  const { width } = useWindowDimensions();
  const order = useDashboardStore((s) => s.order);
  const hidden = useDashboardStore((s) => s.hidden);
  const density = useDashboardStore((s) => s.density);
  const accent = useDashboardStore((s) => s.accent);
  const toggleWidget = useDashboardStore((s) => s.toggleWidget);
  const moveWidget = useDashboardStore((s) => s.moveWidget);
  const setDensity = useDashboardStore((s) => s.setDensity);
  const setAccent = useDashboardStore((s) => s.setAccent);
  const reset = useDashboardStore((s) => s.reset);
  const { preference, setPreference } = useTheme();

  const isWide = width >= 720;

  function confirmReset() {
    Alert.alert(
      'Reset dashboard layout?',
      'This restores widget order, visibility, and spacing. Your app appearance and dashboard accent stay unchanged.',
      [
        { text: 'Keep my layout', style: 'cancel' },
        { text: 'Reset layout', style: 'destructive', onPress: reset },
      ],
    );
  }

  function renderRow(id: WidgetId, index: number) {
    const meta = WIDGET_META[id];
    const isHidden = hidden.includes(id);
    return (
      <View key={id} style={[styles.row, isHidden && styles.rowHidden]}>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowLabel}>{meta.label}</Text>
        </View>
        <View style={styles.orderControls} accessibilityLabel={`Reorder ${meta.label}`}>
          <IconButton
            icon="chevron-up"
            accessibilityLabel={`Move ${meta.label} up`}
            variant="surface"
            size={44}
            iconSize={18}
            disabled={index === 0}
            onPress={() => moveWidget(id, -1)}
          />
          <IconButton
            icon="chevron-down"
            accessibilityLabel={`Move ${meta.label} down`}
            variant="surface"
            size={44}
            iconSize={18}
            disabled={index === order.length - 1}
            onPress={() => moveWidget(id, 1)}
          />
        </View>
        <Switch
          value={!isHidden}
          onValueChange={() => toggleWidget(id)}
          accessibilityLabel={`Show ${meta.label} widget`}
          accessibilityHint={meta.description}
          trackColor={{ false: colors.surfaceElevated, true: colors.cyan }}
          thumbColor={colors.textPrimary}
        />
      </View>
    );
  }

  return (
    <CompactGlassSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Arrange your hollow dashboard settings"
      closeAccessibilityLabel="Done customizing"
      maxWidth={520}
      maxHeightRatio={0.88}
      header={
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>YOUR DASHBOARD</Text>
          <Text style={styles.title}>Arrange your hollow</Text>
        </View>
      }
    >
      <View style={styles.appearanceGroup}>
        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <SegmentedControl
          options={[
            { value: 'system', label: 'System', icon: 'contrast-outline' },
            { value: 'light', label: 'Daylight', icon: 'sunny-outline' },
            { value: 'dark', label: 'Night', icon: 'moon-outline' },
          ]}
          value={preference}
          onChange={setPreference}
          accessibilityLabel="App appearance"
        />
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
              { value: 'forest', label: 'Forest', icon: 'leaf-outline', tintColor: colors.cyan },
              { value: 'cosmic', label: 'Cosmic', icon: 'planet-outline', tintColor: colors.violet },
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
          onPress={confirmReset}
          accessibilityRole="button"
          accessibilityLabel="Reset dashboard layout"
          style={({ pressed }) => [styles.resetRow, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
          <Text style={styles.resetLabel}>Reset to default layout</Text>
        </Pressable>
      </ScrollView>
    </CompactGlassSheet>
  );
}

// Referenced so a future widget forgetting WIDGET_META fails the typecheck here, near the UI that needs it.
const _exhaustive: readonly WidgetId[] = DEFAULT_ORDER;
void _exhaustive;

const styles = StyleSheet.create({
  headerText: { flex: 1 },
  eyebrow: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 2, color: colors.cyan },
  title: { ...typography.title, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  preferences: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  preferencesWide: { flexDirection: 'row', gap: spacing.md },
  appearanceGroup: { width: '100%' },
  preferenceGroup: { flex: 1 },
  widgetScroll: { flexShrink: 1 },
  scroll: { paddingBottom: spacing.md },
  sectionLabel: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 1.8, color: colors.textMuted, marginBottom: spacing.sm },
  rows: { gap: 2 },
  row: {
    minHeight: 44,
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
  orderControls: { flexDirection: 'row', gap: 2 },
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
