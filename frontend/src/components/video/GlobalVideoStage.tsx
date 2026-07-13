import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  FlatList,
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
import { GlassPanel } from '../ui/GlassPanel';
import { GradientText } from '../ui/GradientText';
import { PressableScale } from '../ui/PressableScale';
import { useDockClearance, usePlayerChromeBottomOffset } from '../../hooks/useBottomChromeClearance';
import { RAIL_WIDTH, useResponsive } from '../../hooks/useResponsive';
import { streamUrl } from '../../services/api/library';
import { tokenStorage } from '../../services/storage/tokenStorage';
import * as PlayerService from '../../services/audio/PlayerService';
import { useLibraryStore } from '../../store/libraryStore';
import { useVideoPlayerStore } from '../../store/videoPlayerStore';
import { coverGradient, displayArtist, displayTitle, thumbnailUri } from '../../utils/mediaDisplay';
import { colors, glass, glassBlur, gradients, motion, radii, shadows, spacing, typography } from '../../theme/tokens';

const STRIP_CARD_WIDTH = 132;
const MINI_THUMB_WIDTH = 76;
const MINI_THUMB_HEIGHT = 43;
const CINEMA_MAX_WIDTH = 1440;
const VIDEO_NATIVE_CONTROLS_CLEARANCE = 58;
export const VIDEO_CHROME_HIDE_DELAY_MS = 4000;

/**
 * The one place video actually plays. Lives outside the navigation stack so
 * minimizing never unmounts (and never stops) the video — it just shrinks
 * into the fixed transport strip shared with the rest of the app chrome.
 */
export function GlobalVideoStage() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const dockClearance = useDockClearance();
  const contextualBottomOffset = usePlayerChromeBottomOffset();
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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearControlsTimer = useCallback(() => {
    if (controlsTimer.current) {
      clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
    }
  }, []);

  const hideControls = useCallback(() => {
    if (mode !== 'expanded') return;
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: reduceMotion ? 0 : motion.duration.base,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setControlsVisible(false);
    });
  }, [controlsOpacity, mode, reduceMotion]);

  const showControls = useCallback(() => {
    clearControlsTimer();
    setControlsVisible(true);
    controlsOpacity.stopAnimation();
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : motion.duration.fast,
      useNativeDriver: true,
    }).start();
    if (mode === 'expanded') {
      controlsTimer.current = setTimeout(hideControls, VIDEO_CHROME_HIDE_DELAY_MS);
    }
  }, [clearControlsTimer, controlsOpacity, hideControls, mode, reduceMotion]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (mode === 'expanded') showControls();
    else clearControlsTimer();
    return clearControlsTimer;
  }, [clearControlsTimer, media?.id, mode, showControls]);

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

  // The reverse direction — playerStore closes this stage and bumps the pause
  // signal the moment audio is about to play. This component owns the actual
  // video instance, so it performs the pause.
  useEffect(() => {
    if (pauseRequestedAt) player.pause();
  }, [pauseRequestedAt, player]);

  useEffect(() => {
    if (mode === 'closed') player.pause();
    if (mode !== 'expanded') setTheater(false);
  }, [mode, player]);

  const miniBottom =
    (isDesktop ? insets.bottom + spacing.md : insets.bottom + dockClearance + spacing.sm) +
    contextualBottomOffset;
  const desktopStageWidth = Math.max(
    320,
    Math.min(
      CINEMA_MAX_WIDTH,
      screenWidth - spacing.xxxl * 2,
      Math.max(320, (screenHeight - insets.top - insets.bottom - 112) * (16 / 9)),
    ),
  );
  const desktopStageHeight = desktopStageWidth * (9 / 16);
  const stageBottomGutter = isDesktop && !theater
    ? Math.max(0, (screenHeight - desktopStageHeight) / 2)
    : insets.bottom;
  const videoChromeBottom = stageBottomGutter + VIDEO_NATIVE_CONTROLS_CLEARANCE;

  if (!media || mode === 'closed') return null;

  if (mode === 'mini') {
    return (
      <View
        pointerEvents="box-none"
        testID="video-mini-strip"
        style={[
          styles.miniHolder,
          isDesktop && styles.miniHolderDesktop,
          {
            bottom: miniBottom,
            left: isDesktop ? RAIL_WIDTH + spacing.lg : spacing.lg,
            right: spacing.lg,
          },
        ]}
      >
        <GlassPanel style={styles.miniPanel} overlayColor={glass.fillHeavy}>
          <View testID="video-mini-strip-content" style={styles.miniContent}>
            <Pressable
              onPress={expand}
              testID="video-mini-thumbnail"
              accessibilityRole="button"
              accessibilityLabel="Expand video"
              style={styles.miniThumbButton}
            >
              <VideoView
                player={player}
                style={styles.miniVideo}
                contentFit="cover"
                nativeControls={false}
              />
            </Pressable>

            <Pressable onPress={expand} accessibilityRole="button" accessibilityLabel="Expand video" style={styles.miniMeta}>
              <View style={styles.miniEyebrowRow}>
                <Ionicons name="videocam" size={11} color={colors.cyan} />
                <Text style={styles.miniEyebrow}>NOW PLAYING</Text>
              </View>
              <Text numberOfLines={1} style={styles.miniTitle}>{displayTitle(media)}</Text>
              <Text numberOfLines={1} style={styles.miniArtist}>
                {displayArtist(media) ?? 'Unknown source'}
              </Text>
            </Pressable>

            <View style={styles.miniControls}>
              <Pressable
                onPress={() => (isPlaying ? player.pause() : player.play())}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
                hitSlop={10}
                style={styles.miniButton}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={17} color={colors.cyan} />
              </Pressable>
              <Pressable onPress={expand} accessibilityRole="button" accessibilityLabel="Expand video" hitSlop={10} style={styles.miniButton}>
                <Ionicons name="expand" size={16} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => { player.pause(); close(); }}
                accessibilityRole="button"
                accessibilityLabel="Close video"
                hitSlop={10}
                style={styles.miniButton}
              >
                <Ionicons name="close" size={17} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        </GlassPanel>
      </View>
    );
  }

  // ---- expanded (fullscreen) ----
  // No RippleField here on purpose: its continuous Animated.loop timers were
  // running the whole time a video played even though the video (contain-fit,
  // full-screen) covers it almost entirely — pure wasted animation work
  // stacked directly under the video layer. The plain `root` background
  // already reads fine for the thin letterbox bars.
  return (
    <View style={styles.root} onTouchStart={showControls} onPointerMove={showControls}>
      {thumbnailUri(media) ? (
        <Image
          source={{ uri: thumbnailUri(media)! }}
          style={styles.ambientPoster}
          contentFit="cover"
          blurRadius={32}
          cachePolicy="memory-disk"
          recyclingKey={`video-ambient-${media.id}`}
          pointerEvents="none"
        />
      ) : (
        <LinearGradient colors={coverGradient(media.id)} style={styles.ambientPoster} pointerEvents="none" />
      )}
      <LinearGradient
        colors={['rgba(5,9,17,0.45)', 'rgba(5,10,11,0.92)']}
        style={styles.ambientScrim}
        pointerEvents="none"
      />

      <Animated.View
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
        style={[styles.topBar, { top: insets.top + spacing.sm, opacity: controlsOpacity }]}
      >
        <View style={[styles.topChrome, glassBlur]}>
          <Pressable
            onPress={() => { showControls(); minimize(); }}
            onFocus={showControls}
            accessibilityRole="button"
            accessibilityLabel="Minimize video"
            hitSlop={12}
            style={styles.closeButton}
          >
            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.topMeta}>
            <Text numberOfLines={1} style={styles.topTitle}>{displayTitle(media)}</Text>
            <Text numberOfLines={1} style={styles.topArtist}>{displayArtist(media) ?? 'Unknown source'}</Text>
          </View>

          <View style={styles.topActions}>
            {!theater && (
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>
                  {queueIndex >= 0 ? `VIDEO ${queueIndex + 1} OF ${videoQueue.length}` : 'VIDEO'}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => { showControls(); setTheater((value) => !value); }}
              onFocus={showControls}
              accessibilityRole="button"
              accessibilityLabel={theater ? 'Exit theater mode' : 'Enter theater mode'}
              hitSlop={12}
              style={styles.closeButton}
            >
              <Ionicons name={theater ? 'contract' : 'expand'} size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <View style={styles.stageArea}>
        <View
          testID="video-cinema-stage"
          style={[
            styles.stage,
            isDesktop && !theater && styles.stageDesktop,
            isDesktop && !theater && { width: desktopStageWidth, height: desktopStageHeight },
          ]}
        >
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
                <Ionicons name="play-circle" size={54} color="rgba(239,245,241,0.85)" />
                <Text style={styles.posterLabel}>Loading…</Text>
              </View>
            </View>
          )}
          <Pressable
            pointerEvents={controlsVisible ? 'none' : 'auto'}
            style={StyleSheet.absoluteFill}
            onPress={showControls}
            accessibilityElementsHidden={controlsVisible}
            accessibilityRole="button"
            accessibilityLabel="Show video controls"
          />
        </View>
      </View>

      {!theater && (
        <Animated.View
          testID="video-bottom-chrome"
          pointerEvents={controlsVisible ? 'auto' : 'none'}
          style={[
            styles.metaBar,
            { bottom: videoChromeBottom, paddingBottom: spacing.sm, opacity: controlsOpacity },
          ]}
        >
          <View style={[styles.metaRow, styles.metaChrome, glassBlur]}>
            <PressableScale onPress={() => { showControls(); if (prevMedia) setMediaId(prevMedia.id); }} accessibilityLabel="Previous video" accessibilityHint={!prevMedia ? 'No previous video' : undefined} disabled={!prevMedia} scaleTo={0.88}>
              <View style={[styles.skipButton, glassBlur]}>
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

            <PressableScale onPress={() => { showControls(); if (nextMedia) setMediaId(nextMedia.id); }} accessibilityLabel="Next video" accessibilityHint={!nextMedia ? 'No next video' : undefined} disabled={!nextMedia} scaleTo={0.88}>
              <View style={[styles.skipButton, glassBlur]}>
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
                    onPress={() => { showControls(); setMediaId(item.id); }}
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
        </Animated.View>
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
    backgroundColor: '#050A0B',
    zIndex: 50,
  },
  ambientPoster: {
    ...(StyleSheet.absoluteFill as object),
    opacity: 0.3,
    transform: [{ scale: 1.08 }],
  },
  ambientScrim: { ...(StyleSheet.absoluteFill as object) },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    alignItems: 'center',
  },
  topChrome: {
    width: '100%',
    maxWidth: 960,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 5,
    borderRadius: radii.lg,
    backgroundColor: glass.fillHeavy,
    borderWidth: 1,
    borderColor: glass.stroke,
    ...shadows.card,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMeta: { flex: 1, minWidth: 0 },
  topTitle: { ...typography.subtitle, color: colors.textPrimary },
  topArtist: { ...typography.caption, color: colors.textMuted },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  chipLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  stageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  stageDesktop: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: glass.strokeStrong,
    ...shadows.card,
  },
  video: { width: '100%', height: '100%' },
  posterWrap: { ...(StyleSheet.absoluteFill as object), alignItems: 'center', justifyContent: 'center' },
  poster: { ...(StyleSheet.absoluteFill as object) },
  posterScrim: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(5,10,11,0.55)' },
  posterSpinner: { alignItems: 'center', gap: spacing.sm },
  posterLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  metaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  metaRow: { width: '100%', maxWidth: 960, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaChrome: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  skipButton: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, alignItems: 'center' },
  title: { ...typography.title, fontSize: 20, lineHeight: 26, textAlign: 'center' },
  artist: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  upNextBlock: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: glass.fillHeavy,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
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
    borderColor: 'rgba(158,181,170,0.14)',
  },
  stripTitle: { ...typography.caption, fontSize: 11, color: colors.textSecondary },

  // ---- fixed mini transport strip ----
  miniHolder: {
    position: 'absolute',
    zIndex: 60,
  },
  miniHolderDesktop: { alignItems: 'center' },
  miniPanel: {
    width: '100%',
    maxWidth: 640,
    borderRadius: radii.md,
  },
  miniContent: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  miniThumbButton: {
    width: MINI_THUMB_WIDTH,
    height: MINI_THUMB_HEIGHT,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  miniVideo: { width: MINI_THUMB_WIDTH, height: MINI_THUMB_HEIGHT },
  miniMeta: { flex: 1, minWidth: 0 },
  miniEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniEyebrow: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 1.3, color: colors.cyan },
  miniTitle: { ...typography.subtitle, fontSize: 13, lineHeight: 17, color: colors.textPrimary },
  miniArtist: { ...typography.caption, fontSize: 11, lineHeight: 14, color: colors.textMuted },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: glass.fillBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
