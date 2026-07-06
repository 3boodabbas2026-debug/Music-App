import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackground } from './AuroraBackground';
import { spacing } from '../../theme/tokens';

/**
 * Standard screen shell: the living aurora backdrop with a safe-area padded
 * content layer above it. Overlays like the mini player should be rendered as
 * siblings of this container, not children, so they can hug the true screen edges.
 */
export function ScreenContainer({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AuroraBackground />
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md },
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
    backgroundColor: '#060B18',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
