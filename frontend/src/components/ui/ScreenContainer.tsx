import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RippleField } from './RippleField';
import { useResponsive } from '../../hooks/useResponsive';
import { spacing } from '../../theme/tokens';

type Props = PropsWithChildren<{
  /** Cap for the centered content column on desktop. */
  maxWidth?: number;
}>;

/**
 * Standard screen shell: the living aurora backdrop with a safe-area padded
 * content layer above it. On desktop the content becomes a centered column
 * with roomier padding so screens read as an app, not a stretched phone.
 * Overlays like the mini player should be rendered as siblings of this
 * container, not children, so they can hug the true screen edges.
 */
export function ScreenContainer({ children, maxWidth = 1100 }: Props) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  return (
    <View style={styles.root}>
      <RippleField />
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
    backgroundColor: '#060607',
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
});
