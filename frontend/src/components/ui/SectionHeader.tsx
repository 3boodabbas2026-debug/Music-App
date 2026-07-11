import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
};

export function SectionHeader({ title, eyebrow, subtitle, actionLabel, onAction, action, style, titleStyle }: Props) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ??
        (actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.eyebrow, color: colors.cyan },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, fontSize: 13, color: colors.textMuted, maxWidth: 560 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionPressed: { opacity: 0.64 },
  actionLabel: { fontFamily: 'Sora_600SemiBold', fontSize: 13, color: colors.cyan },
});
