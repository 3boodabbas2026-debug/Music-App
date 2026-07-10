import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RippleField } from './RippleField';
import { useResponsive } from '../../hooks/useResponsive';
import { useTrackAccent } from '../../hooks/useTrackAccent';
import { usePlayerStore } from '../../store/playerStore';
import { spacing } from '../../theme/tokens';
import { thumbnailUri } from '../../utils/mediaDisplay';

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
  // Tab screens stay mounted when backgrounded (React Navigation doesn't
  // unmount them by default) — without this, every tab a user has ever
  // visited keeps running RippleField's animation loops forever in the
  // background. Only the screen actually on top pays that cost.
  const isFocused = useIsFocused();
  // Low-frequency (changes once per track, not per tick) — safe to read here
  // without reintroducing the whole-store re-render problem fixed elsewhere.
  const rawThumbnail = usePlayerStore((s) => s.currentMedia?.thumbnail_url);
  const accentColor = useTrackAccent(rawThumbnail ? thumbnailUri({ thumbnail_url: rawThumbnail }) : null);
  return (
    <View style={styles.root}>
      {isFocused && <RippleField accentColor={accentColor} />}
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
    backgroundColor: '#050805',
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
});
