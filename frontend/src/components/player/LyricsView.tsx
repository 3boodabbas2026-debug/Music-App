import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RecoverableError } from '../ui/FormError';
import { fetchLyrics, type Lyrics, type SyncedLine } from '../../services/api/lyrics';
import { usePlayerStore } from '../../store/playerStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { motionPresets } from '../../theme/motion';
import { colors, glass, motion, radii, spacing, stateLayers, typography } from '../../theme/tokens';

/** How far ahead of the audio clock a line lights up — feels "on the beat". */
const SYNC_LEAD_SECONDS = 0.25;
const ANNOUNCEMENT_INTERVAL_SECONDS = 15;

function LyricsSkeleton() {
  const reduceMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    sweep.stopAnimation();
    if (reduceMotion) { sweep.setValue(0.3); return; }
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: motion.duration.continuous, easing: Easing.inOut(Easing.sin), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep]);
  return (
    <View style={styles.stateWrap} accessibilityRole="progressbar" accessibilityLabel="Finding the words">
      <Text style={styles.stateEyebrow}>LYRIC FIELD</Text>
      <View style={styles.lyricSkeletonList}>
        {[78, 54, 86, 64, 72].map((width, index) => (
          <View key={`${width}-${index}`} style={[styles.lyricSkeletonLine, { width: `${width}%` }]}>
            <View style={styles.lyricSkeletonMarker} />
            <Animated.View pointerEvents="none" style={[styles.lyricSkeletonSweep, { opacity: reduceMotion ? 0.1 : 0.18, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, 560] }) }] }]} />
          </View>
        ))}
      </View>
      <Text style={styles.stateTitle}>Finding the words…</Text>
      <Text style={styles.stateText}>Setting the page to the rhythm of this track.</Text>
    </View>
  );
}

function seekLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)} minutes ${whole % 60} seconds`;
}

function SyncedLyricLine({
  line,
  active,
  past,
  reduceMotion,
  onPress,
  onLayout,
}: {
  line: SyncedLine;
  active: boolean;
  past: boolean;
  reduceMotion: boolean;
  onPress: () => void;
  onLayout: (offset: number) => void;
}) {
  const focus = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    focus.stopAnimation();
    if (reduceMotion) {
      focus.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(focus, {
      toValue: active ? 1 : 0,
      duration: motionPresets.emphasis.duration,
      easing: motionPresets.emphasis.easing,
      useNativeDriver: true,
    }).start();
  }, [active, focus, reduceMotion]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${line.text}. Seek to ${seekLabel(line.time)}`}
      accessibilityHint="Moves playback to this lyric"
      accessibilityState={{ selected: active }}
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
      style={styles.lyricPressable}
    >
      <Animated.View
        style={[
          styles.lyricLine,
          {
            opacity: focus.interpolate({ inputRange: [0, 1], outputRange: [past ? 0.32 : 0.58, 1] }),
            transform: [{ scale: focus.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.025] }) }],
          },
        ]}
      >
        <Animated.View style={[styles.timingMarker, { opacity: focus }]} />
        <Text style={[styles.line, past && styles.linePast, active && styles.lineActive]}>{line.text}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Karaoke-style synced lyrics for the current track. Lines light up in time
 * with playback and the view keeps the active line centered; tapping a line
 * seeks straight to it. Falls back to plain lyrics, then to a quiet empty state.
 */
export function LyricsView() {
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const reduceMotion = useReducedMotion();

  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [announcedLine, setAnnouncedLine] = useState('');
  const requestGeneration = useRef(0);

  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const viewportHeight = useRef(0);
  const lastScrolledIndex = useRef(-1);
  const lastAnnouncementTime = useRef(-ANNOUNCEMENT_INTERVAL_SECONDS);

  useEffect(() => {
    let alive = true;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setLyrics(null);
    setError(null);
    lineOffsets.current = [];
    lastScrolledIndex.current = -1;
    lastAnnouncementTime.current = -ANNOUNCEMENT_INTERVAL_SECONDS;
    setAutoFollow(true);
    setAnnouncedLine('');
    if (!currentMedia) return;
    setLoading(true);
    fetchLyrics(currentMedia)
      .then((result) => {
        if (alive && generation === requestGeneration.current) setLyrics(result);
      })
      .catch((caught) => {
        if (alive && generation === requestGeneration.current) {
          setError(caught instanceof Error ? caught.message : 'Lyrics could not be loaded.');
        }
      })
      .finally(() => alive && generation === requestGeneration.current && setLoading(false));
    return () => {
      alive = false;
    };
  }, [currentMedia?.id]);

  async function retry() {
    if (!currentMedia || loading) return;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLyrics(currentMedia, { forceRefresh: true });
      if (generation === requestGeneration.current) setLyrics(result);
    } catch (caught) {
      if (generation === requestGeneration.current) {
        setError(caught instanceof Error ? caught.message : 'Lyrics could not be loaded.');
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced?.length) return -1;
    const t = currentTime + SYNC_LEAD_SECONDS;
    let index = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].time <= t) index = i;
      else break;
    }
    return index;
  }, [lyrics, currentTime]);

  useEffect(() => {
    if (!autoFollow || activeIndex < 0 || activeIndex === lastScrolledIndex.current) return;
    const offset = lineOffsets.current[activeIndex];
    if (offset === undefined || !viewportHeight.current) return;
    lastScrolledIndex.current = activeIndex;
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - viewportHeight.current * 0.4),
      animated: !reduceMotion,
    });
  }, [activeIndex, autoFollow, reduceMotion]);

  useEffect(() => {
    if (activeIndex < 0 || !lyrics?.synced?.[activeIndex]) return;
    if (currentTime - lastAnnouncementTime.current < ANNOUNCEMENT_INTERVAL_SECONDS) return;
    lastAnnouncementTime.current = currentTime;
    setAnnouncedLine(lyrics.synced[activeIndex].text);
  }, [activeIndex, currentTime, lyrics]);

  function resumeFollowing() {
    lastScrolledIndex.current = -1;
    setAutoFollow(true);
  }

  function seekToLine(index: number) {
    const line = lyrics?.synced?.[index];
    if (!line) return;
    seek(line.time);
    lastAnnouncementTime.current = line.time;
    setAnnouncedLine(line.text);
  }

  if (!currentMedia) return null;

  if (loading && !lyrics) {
    return <LyricsSkeleton />;
  }

  if (error && !lyrics) {
    return (
      <View style={styles.stateWrap}>
        <RecoverableError title="Lyrics could not be loaded" message={error} actionLabel="Retry lyrics" onAction={() => void retry()} icon="document-text-outline" />
      </View>
    );
  }

  if (!lyrics || (!lyrics.synced?.length && !lyrics.plain)) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateEyebrow}>LYRIC FIELD</Text>
        <Ionicons name="text-outline" size={26} color={colors.textMuted} />
        <Text style={styles.stateTitle}>An instrumental page</Text>
        <Text style={styles.stateText}>No lyrics were found for this track. The listening moment stays open.</Text>
      </View>
    );
  }

  if (lyrics.synced?.length) {
    return (
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        contentContainerStyle={styles.syncedContent}
        onScrollBeginDrag={() => setAutoFollow(false)}
      >
        <View style={styles.followRow}>
          <Text style={styles.followStatus}>{autoFollow ? 'Following the music' : 'Auto-follow paused'}</Text>
          {!autoFollow ? (
            <Pressable onPress={resumeFollowing} accessibilityRole="button" accessibilityLabel="Resume lyric auto-follow">
              <Text style={styles.retryText}>Resume</Text>
            </Pressable>
          ) : null}
        </View>
        <Text accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.srCurrent}>
          {announcedLine ? `Current lyric: ${announcedLine}` : ''}
        </Text>
        {error ? (
          <View style={styles.cachedNotice} accessibilityLiveRegion="polite">
            <Ionicons name="warning-outline" size={17} color={colors.warning} />
            <Text style={styles.cachedNoticeText}>Showing saved lyrics. {error}</Text>
            <Pressable onPress={() => void retry()} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : null}
        {lyrics.synced.map((line, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <SyncedLyricLine
              key={`${line.time}-${i}`}
              line={line}
              active={isActive}
              past={isPast}
              reduceMotion={reduceMotion}
              onPress={() => seekToLine(i)}
              onLayout={(offset) => { lineOffsets.current[i] = offset; }}
            />
          );
        })}
        <View style={styles.tail} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.plainContent}>
      {error ? (
        <View style={styles.cachedNotice} accessibilityLiveRegion="polite">
          <Ionicons name="warning-outline" size={17} color={colors.warning} />
          <Text style={styles.cachedNoticeText}>Showing saved lyrics. {error}</Text>
          <Pressable onPress={() => void retry()} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : null}
      <Text style={styles.plain}>{lyrics.plain}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  syncedContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  lyricPressable: { width: '100%', maxWidth: 560, borderRadius: 12 },
  lyricLine: { minHeight: 48, justifyContent: 'center', paddingVertical: spacing.sm, paddingLeft: spacing.lg },
  timingMarker: { position: 'absolute', left: 0, top: spacing.sm, bottom: spacing.sm, width: 2, borderRadius: 2, backgroundColor: colors.cyan },
  line: {
    ...typography.subtitle,
    fontSize: 18,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  linePast: {
    color: colors.textMuted,
  },
  lineActive: {
    color: colors.textPrimary,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 21,
    lineHeight: 30,
  },
  tail: { height: 180 },
  plainContent: { padding: spacing.xl, alignItems: 'center' },
  plain: {
    ...typography.body,
    width: '100%',
    maxWidth: 560,
    fontSize: 15,
    lineHeight: 28,
    color: colors.textSecondary,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  stateEyebrow: { ...typography.eyebrow, fontSize: 9, letterSpacing: 2.2, color: colors.cyan, marginBottom: spacing.sm },
  stateTitle: { ...typography.sectionTitle, fontSize: 19, lineHeight: 26, color: colors.textPrimary, textAlign: 'center' },
  stateText: { ...typography.body, maxWidth: 410, color: colors.textMuted, textAlign: 'center' },
  lyricSkeletonList: { width: '100%', maxWidth: 560, gap: spacing.sm, marginBottom: spacing.md },
  lyricSkeletonLine: { position: 'relative', overflow: 'hidden', height: 34, justifyContent: 'center', borderRadius: radii.control, backgroundColor: stateLayers.skeleton.base, borderWidth: 1, borderColor: glass.stroke },
  lyricSkeletonMarker: { width: 2, height: 18, marginLeft: spacing.sm, borderRadius: radii.pill, backgroundColor: stateLayers.skeleton.raised },
  lyricSkeletonSweep: { position: 'absolute', top: 0, bottom: 0, width: 72, backgroundColor: stateLayers.skeleton.sweep },
  errorTitle: { ...typography.sectionTitle, fontSize: 19, lineHeight: 26, color: colors.textPrimary, textAlign: 'center' },
  cachedNotice: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, marginBottom: spacing.md, borderRadius: 10, backgroundColor: 'rgba(242,183,93,0.08)' },
  cachedNoticeText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  retryText: { ...typography.caption, fontFamily: 'Sora_600SemiBold', color: colors.cyan },
  followRow: { width: '100%', maxWidth: 560, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  followStatus: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  srCurrent: { position: 'absolute', width: 1, height: 1, opacity: 0.01, overflow: 'hidden' },
});
