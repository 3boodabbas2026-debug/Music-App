import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fetchLyrics, type Lyrics } from '../../services/api/lyrics';
import { usePlayerStore } from '../../store/playerStore';
import { colors, spacing, typography } from '../../theme/tokens';

/** How far ahead of the audio clock a line lights up — feels "on the beat". */
const SYNC_LEAD_SECONDS = 0.25;

/**
 * Karaoke-style synced lyrics for the current track. Lines light up in time
 * with playback and the view keeps the active line centered; tapping a line
 * seeks straight to it. Falls back to plain lyrics, then to a quiet empty state.
 */
export function LyricsView() {
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const viewportHeight = useRef(0);
  const lastScrolledIndex = useRef(-1);

  useEffect(() => {
    let alive = true;
    setLyrics(null);
    lineOffsets.current = [];
    lastScrolledIndex.current = -1;
    if (!currentMedia) return;
    setLoading(true);
    fetchLyrics(currentMedia)
      .then((result) => {
        if (alive) setLyrics(result);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [currentMedia?.id]);

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
    if (activeIndex < 0 || activeIndex === lastScrolledIndex.current) return;
    const offset = lineOffsets.current[activeIndex];
    if (offset === undefined || !viewportHeight.current) return;
    lastScrolledIndex.current = activeIndex;
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - viewportHeight.current * 0.4),
      animated: true,
    });
  }, [activeIndex]);

  if (!currentMedia) return null;

  if (loading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator color={colors.cyan} />
        <Text style={styles.stateText}>Finding the words…</Text>
      </View>
    );
  }

  if (!lyrics || (!lyrics.synced?.length && !lyrics.plain)) {
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="text-outline" size={26} color={colors.textMuted} />
        <Text style={styles.stateText}>No lyrics found for this track.</Text>
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
      >
        {lyrics.synced.map((line, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <Pressable
              key={`${line.time}-${i}`}
              onPress={() => seek(line.time)}
              onLayout={(e) => {
                lineOffsets.current[i] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.line, isPast && styles.linePast, isActive && styles.lineActive]}>
                {line.text}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.tail} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.plainContent}>
      <Text style={styles.plain}>{lyrics.plain}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  syncedContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  line: {
    ...typography.subtitle,
    fontSize: 18,
    lineHeight: 26,
    color: 'rgba(233,229,220,0.6)',
  },
  linePast: {
    color: 'rgba(233,229,220,0.35)',
  },
  lineActive: {
    color: colors.textPrimary,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
  },
  tail: { height: 160 },
  plainContent: { padding: spacing.lg },
  plain: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  stateText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
