import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '../../hooks/useResponsive';
import { colors, spacing } from '../../theme/tokens';
import { RippleField } from './RippleField';

type Props = PropsWithChildren<{
  /** Cap for the centered content column on desktop. */
  maxWidth?: number;
}>;

/** Safe-area aware screen canvas with a static ambient layer and centered content. */
export function ScreenContainer({ children, maxWidth = 1100 }: Props) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const isFocused = useIsFocused();

  return (
    <View style={styles.root}>
      {isFocused ? <RippleField /> : null}
      <View
        style={[
          styles.content,
          isDesktop && { maxWidth, paddingHorizontal: spacing.xl },
          {
            paddingTop: insets.top + (isDesktop ? spacing.xl : spacing.md),
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
});
