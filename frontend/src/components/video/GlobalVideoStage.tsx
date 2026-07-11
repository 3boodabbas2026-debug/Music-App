import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../ui/Artwork';
import { GradientText } from '../ui/GradientText';
import { PressableScale } from '../ui/PressableScale';
import { streamUrl } from '../../services/api/library';
import { tokenStorage } from '../../services/storage/tokenStorage';
import * as PlayerService from '../../services/audio/PlayerService';
import { useLibraryStore } from '../../store/libraryStore';
import { useVideoPlayerStore } from '../../store/videoPlayerStore';
import { coverGradient, displayArtist, displayTitle, thumbnailUri } from '../../utils/mediaDisplay';
import { colors, gradients, radii, shadows, spacing, typography } from '../../theme/tokens';

const STRIP_CARD_WIDTH = 132;
const MINI_WIDTH = 208;
const MINI_HEIGHT = 117; // 16:9

/**
 * The one place video actually plays. Lives outside the navigation stack so
 * minimizing never unmounts (and never stops) the video — it just shrinks
 * into a draggable floating window docked wherever the viewer left it.
 */
export function GlobalVideoStage() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const items = useLibraryStore((s) => s.items);
  const mediaId = useVideoPlayerStore((s) => s.mediaId);
  const mode = useVideoPlayerStore((s) => s.mode);
  const pauseRequestedAt = useVideoPlayerStore((s) => s.pauseRequestedAt);
  const setMediaId = useVideoPlayerStore((s) => s.setMediaId);
  const minimize = useVideoPlayerStore((s) => s.minimize);
  const expand = useVideoPlayerStore((s) => s.expand);
  const close = useVideoPlayerStore((s) => s.close);

  const [theater, setTheater] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const videoQueue = useMemo(
    () => [...items].filter((m) => m.media_type === 'video').sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [items],
  );
  const queueIndex = videoQueue.findIndex((m) => m.id === mediaId);
  const media = videoQueue[queueIndex] ?? items.find((m) => m.id === mediaId) ?? null;
  const prevMedia = queueIndex > 0 ? videoQueue[queueIndex - 1] : null;
  const nextMedia = queueIndex >= 0 && queueIndex < videoQueue.length - 1 ? videoQueue[queueIndex + 1] : null;
  const upNext = queueIndex >= 0 ? videoQueue.slice(queueIndex + 1, queueIndex + 9) : [];

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // One straight shot from "video chosen" to "player loading": the access
  // token comes from tokenStorage's in-memory cache (a microtask, not an
  // AsyncStorage round trip after the first read), so there's no visible
  // token-fetch → state → replace stutter on every open.
  useEffect(() => {
    if (!media) return;
    let alive = true;
    const mediaId = media.id;
    setVideoReady(false);
    (async () => {
      const token = await tokenStorage.getAccessToken();
      if (!alive) return;
      const url = token ? `${streamUrl(mediaId)}?token=${encodeURIComponent(token)}` : streamUrl(mediaId);
      await player.replaceAsync(url);
      if (alive) player.play();
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [media?.id, player]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setVideoReady(true);
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      if (nextMedia) setMediaId(nextMedia.id);
    });
    return () => subscription.remove();
  }, [player, nextMedia?.id, setMediaId]);

  useEffect(() => {
    const subscription = player.addListener('playingChange', ({ isPlaying: playing }) => setIsPlaying(playing));
    return () => subscription.remove();
  }, [player]);

  // Audio and video are never meant to sound at once: whenever the video
  // starts (or resumes) playing, pause whatever track is in the audio player.
  useEffect(() => {
    if (isPlaying) PlayerService.pausePlayback();
  }, [isPlaying]);

  // The reverse direction — playerStore calls requestPause() the moment audio
  // is about to play, and this is the one place that actually holds the video
  // player instance to act on it.
  useEffect(() => {
    if (pauseRequestedAt) player.pause();
  }, [pauseRequestedAt, player]);

  // Mini window drag — clamped to screen bounds, released position sticks.
  // Runs on the native driver (JS thread never sees per-frame move events),
  // which needs the current x/y tracked outside Animated's private `_value`
  // — a listener mirrors it into this ref instead, since native-driven
  // values aren't readable synchronously the way JS-driven ones are.
  const pan = useRef(new Animated.ValueXY({ x: 12, y: 80 })).current;
  const panValueRef = useRef({ x: 12, y: 80 });
  useEffect(() => {
    const id = pan.addListener((value) => {
      panValueRef.current = value;
    });
    return () => pan.removeListener(id);
  }, [pan]);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        pan.stopAnimation();
        pan.setOffset(panValueRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: true }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // Snap to the nearest left/right edge (like every OS-level PiP) so
        // the window always rests somewhere intentional, never mid-screen.
        const rawX = panValueRef.current.x;
        const x = rawX + MINI_WIDTH / 2 < screenWidth / 2 ? 12 : screenWidth - MINI_WIDTH - 12;
        const y = Math.max(insets.top + 8, Math.min(screenHeight - MINI_HEIGHT - 8, panValueRef.current.y));
        Animated.spring(pan, { toValue: { x, y }, useNativeDriver: true, friction: 8 }).start();
      },
    }),
  ).current;

  if (!media || mode === 'closed') return null;

  if (mode === 'mini') {
    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.miniWrap, { transform: pan.getTranslateTransform() }]}
      >
        <Pressable onPress={expand} accessibilityLabel="Expand video" style={StyleSheet.absoluteFill}>
          <VideoView player={player} style={styles.miniVideo} contentFit="cover" nativeControls={false} />
        </Pressable>
        <LinearGradient colors={gradients.coverScrim} style={styles.miniScrim} pointerEvents="none" />
        <Text numberOfLines={1} style={styles.miniTitle} pointerEvents="none">
          {displayTitle(media)}
        </Text>
        <View style={styles.miniControls}>
          <Pressable onPress={() => (isPlaying ? player.pause() : player.play())} accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'} hitSlop={12} style={styles.miniButton}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={13} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={expand} accessibilityLabel="Expand video" hitSlop={12} style={styles.miniButton}>
            <Ionicons name="expand" size={12} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={close} accessibilityLabel="Close video" hitSlop={12} style={styles.miniButton}>
            <Ionicons name="close" size={13} color={colors.textPrimary} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // ---- expanded (fullscreen) ----
  // No RippleField here on purpose: its continuous Animated.loop timers were
  // running the whole time a video played even though the video (contain-fit,
  // full-screen) covers it almost entirely — pure wasted animation work
  // stacked directly under the video layer. The plain `root` background
  // already reads fine for the thin letterbox bars.
  return (
    <View style={styles.root}>
      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable onPress={minimize} accessibilityLabel="Minimize video" hitSlop={12} style={styles.closeButton}>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
        {!theater && (
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>
              {queueIndex >= 0 ? `VIDEO ${queueIndex + 1} OF ${videoQueue.length}` : 'VIDEO'}
            </Text>
          </View>
        )}
        <Pressable onPress={() => setTheater((v) => !v)} accessibilityLabel={theater ? 'Exit theater mode' : 'Enter theater mode'} hitSlop={12} style={styles.closeButton}>
          <Ionicons name={theater ? 'contract' : 'expand'} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.stage}>
        <VideoView player={player} style={styles.video} nativeControls allowsPictureInPicture contentFit="contain" />
        {/* While the stream warms up, show the video's own poster frame with
            a spinner instead of the browser's raw gray play-button box. */}
        {!videoReady && (
          <View style={styles.posterWrap} pointerEvents="none">
            {thumbnailUri(media) ? (
              <Image
                source={{ uri: thumbnailUri(media)! }}
                style={styles.poster}
                contentFit="cover"
                blurRadius={4}
                cachePolicy="memory-disk"
                priority="high"
                loading="eager"
                recyclingKey={`video-poster-${media.id}`}
                transition={160}
                accessible
                accessibilityLabel={`${displayTitle(media)} video poster`}
                alt={`${displayTitle(media)} video poster`}
              />
            ) : (
              <LinearGradient colors={coverGradient(media.id)} style={styles.poster} />
            )}
            <View style={styles.posterScrim} />
            <View style={styles.posterSpinner}>
              <Ionicons name="play-circle" size={54} color="rgba(241,237,247,0.85)" />
              <Text style={styles.posterLabel}>Loading…</Text>
            </View>
          </View>
        )}
      </View>

      {!theater && (
        <View style={[styles.metaBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.metaRow}>
            <PressableScale onPress={() => prevMedia && setMediaId(prevMedia.id)} accessibilityLabel="Previous video" accessibilityHint={!prevMedia ? 'No previous video' : undefined} disabled={!prevMedia} scaleTo={0.88}>
              <View style={styles.skipButton}>
                <Ionicons name="play-skip-back" size={20} color={colors.textSecondary} />
              </View>
            </PressableScale>

            <View style={styles.meta}>
              <GradientText numberOfLines={1} style={styles.title}>
                {displayTitle(media)}
              </GradientText>
              <Text numberOfLines={1} style={styles.artist}>
                {displayArtist(media) ?? 'Unknown source'}
              </Text>
            </View>

            <PressableScale onPress={() => nextMedia && setMediaId(nextMedia.id)} accessibilityLabel="Next video" accessibilityHint={!nextMedia ? 'No next video' : undefined} disabled={!nextMedia} scaleTo={0.88}>
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
                  <PressableScale
                    onPress={() => setMediaId(item.id)}
                    accessibilityLabel={`Play ${displayTitle(item)}`}
                    scaleTo={0.95}
                  >
                    <View style={styles.stripCard}>
                      <Artwork
                        media={item}
                        size="100%"
                        style={styles.stripThumb}
                        borderRadius={radii.sm}
                        accessibilityLabel={`${displayTitle(item)} video poster`}
                      />
                      <Text numberOfLines={1} style={styles.stripTitle}>
                        {displayTitle(item)}
                      </Text>
                    </View>
                  </PressableScale>
                )}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#09060F',
    zIndex: 50,
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
    backgroundColor: 'rgba(27,20,38,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(27,20,38,0.6)',
  },
  chipLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', height: '100%' },
  posterWrap: { ...(StyleSheet.absoluteFill as object), alignItems: 'center', justifyContent: 'center' },
  poster: { ...(StyleSheet.absoluteFill as object) },
  posterScrim: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(9,6,15,0.55)' },
  posterSpinner: { alignItems: 'center', gap: spacing.sm },
  posterLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  metaBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, width: '100%', maxWidth: 960, alignSelf: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skipButton: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(27,20,38,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, alignItems: 'center' },
  title: { ...typography.title, fontSize: 20, lineHeight: 26, textAlign: 'center' },
  artist: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  upNextBlock: { marginTop: spacing.md },
  upNextHeading: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textMuted, marginBottom: spacing.sm },
  stripContent: { gap: spacing.sm },
  stripCard: { width: STRIP_CARD_WIDTH, gap: 4 },
  stripThumb: {
    width: STRIP_CARD_WIDTH,
    height: 74,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.14)',
  },
  stripTitle: { ...typography.caption, fontSize: 11, color: colors.textSecondary },

  // ---- mini floating window ----
  miniWrap: {
    position: 'absolute',
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(174,165,192,0.18)',
    zIndex: 60,
    ...shadows.card,
  },
  miniVideo: { width: '100%', height: '100%' },
  miniScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  miniTitle: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm + 26,
    right: spacing.sm,
    ...typography.caption,
    fontSize: 11,
    color: colors.textPrimary,
  },
  miniControls: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm - 2,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  miniButton: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,6,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
