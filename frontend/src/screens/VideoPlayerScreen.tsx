import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RippleField } from '../components/ui/RippleField';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { streamUrl } from '../services/api/library';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useLibraryStore } from '../store/libraryStore';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPlayer'>;

const STRIP_CARD_WIDTH = 132;

export function VideoPlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const items = useLibraryStore((s) => s.items);
  // The screen owns its position in the video queue, so next/prev/auto-advance
  // swap sources in place instead of stacking navigation screens.
  const [mediaId, setMediaId] = useState(route.params.mediaId);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const videoQueue = useMemo(
    () =>
      [...items]
        .filter((m) => m.media_type === 'video')
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [items],
  );
  const queueIndex = videoQueue.findIndex((m) => m.id === mediaId);
  const media = videoQueue[queueIndex] ?? items.find((m) => m.id === mediaId);
  const prevMedia = queueIndex > 0 ? videoQueue[queueIndex - 1] : null;
  const nextMedia = queueIndex >= 0 && queueIndex < videoQueue.length - 1 ? videoQueue[queueIndex + 1] : null;
  const upNext = queueIndex >= 0 ? videoQueue.slice(queueIndex + 1, queueIndex + 9) : [];

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!media) return;
      const token = await tokenStorage.getAccessToken();
      const url = token
        ? `${streamUrl(media.id)}?token=${encodeURIComponent(token)}`
        : streamUrl(media.id);
      if (alive) setSourceUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [media?.id]);

  useEffect(() => {
    if (!sourceUrl) return;
    player.replaceAsync(sourceUrl).then(() => player.play()).catch(() => {});
  }, [sourceUrl, player]);

  // Binge behavior: when a video ends, roll straight into the next one.
  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      if (nextMedia) setMediaId(nextMedia.id);
    });
    return () => subscription.remove();
  }, [player, nextMedia?.id]);

  if (!media) {
    navigation.goBack();
    return null;
  }

  return (
    <View style={styles.root}>
      <RippleField />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>
            {queueIndex >= 0 ? `VIDEO ${queueIndex + 1} OF ${videoQueue.length}` : 'VIDEO'}
          </Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.stage}>
        {sourceUrl ? (
          <VideoView
            player={player}
            style={styles.video}
            nativeControls
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : (
          <ActivityIndicator color={colors.cyan} />
        )}
      </View>

      <View style={[styles.metaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.metaRow}>
          <PressableScale onPress={() => prevMedia && setMediaId(prevMedia.id)} disabled={!prevMedia} scaleTo={0.88}>
            <View style={styles.skipButton}>
              <Ionicons name="play-skip-back" size={20} color={colors.textSecondary} />
            </View>
          </PressableScale>

          <View style={styles.meta}>
            <GradientText numberOfLines={1} style={styles.title}>
              {media.title ?? media.recognized_title ?? 'Untitled'}
            </GradientText>
            <Text numberOfLines={1} style={styles.artist}>
              {media.artist ?? media.recognized_artist ?? 'Unknown source'}
            </Text>
          </View>

          <PressableScale onPress={() => nextMedia && setMediaId(nextMedia.id)} disabled={!nextMedia} scaleTo={0.88}>
            <View style={styles.skipButton}>
              <Ionicons name="play-skip-forward" size={20} color={colors.textSecondary} />
            </View>
          </PressableScale>
        </View>

        {upNext.length > 0 && (
          <View style={styles.upNextBlock}>
            <Text style={styles.upNextHeading}>UP NEXT</Text>
            <FlatList
              horizontal
              data={upNext}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripContent}
              renderItem={({ item }) => (
                <PressableScale onPress={() => setMediaId(item.id)} scaleTo={0.95}>
                  <View style={styles.stripCard}>
                    {item.thumbnail_url ? (
                      <Image source={{ uri: item.thumbnail_url }} style={styles.stripThumb} />
                    ) : (
                      <LinearGradient colors={gradients.coverFallback} style={styles.stripThumb}>
                        <Ionicons name="videocam" size={16} color="rgba(248,250,252,0.4)" />
                      </LinearGradient>
                    )}
                    <Text numberOfLines={1} style={styles.stripTitle}>
                      {item.title ?? item.recognized_title ?? 'Untitled'}
                    </Text>
                  </View>
                </PressableScale>
              )}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060607',
  },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(23,24,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(23,24,27,0.6)',
  },
  chipLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  topSpacer: { width: 40 },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  metaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skipButton: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(23,24,27,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, alignItems: 'center' },
  title: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  artist: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  upNextBlock: { marginTop: spacing.md },
  upNextHeading: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  stripContent: { gap: spacing.sm },
  stripCard: { width: STRIP_CARD_WIDTH, gap: 4 },
  stripThumb: {
    width: STRIP_CARD_WIDTH,
    height: 74,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233,229,220,0.14)',
  },
  stripTitle: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
});
