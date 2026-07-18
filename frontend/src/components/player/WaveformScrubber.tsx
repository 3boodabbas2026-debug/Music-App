import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, glass, radii, typography } from '../../theme/tokens';

const BAR_COUNT = 40;
const MAX_BAR = 40;
const MIN_BAR = 8;
const SEEK_STEP_SECONDS = 5;
const FALLBACK_BARS = Array.from({ length: BAR_COUNT }, (_, index) => {
  const phase = index / (BAR_COUNT - 1);
  return 0.28 + Math.sin(phase * Math.PI) * 0.38 + Math.sin(phase * Math.PI * 6) * 0.08;
});

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function normalizeBars(data: number[] | null | undefined): number[] {
  if (!data?.length) return FALLBACK_BARS;
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const sourceIndex = Math.min(data.length - 1, Math.round((index / (BAR_COUNT - 1)) * (data.length - 1)));
    return Math.max(0.08, Math.min(1, Math.abs(data[sourceIndex] ?? 0)));
  });
}

type Props = {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  activeColor?: string;
  /** Optional analyzed amplitudes. When absent, the bars are explicitly presented as decoration. */
  waveformData?: number[] | null;
};

/** A semantic time slider whose waveform is only a visual treatment. */
export function WaveformScrubber({
  currentTime,
  duration,
  onSeek,
  activeColor = colors.cyan,
  waveformData,
}: Props) {
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const originX = useRef(0);
  const width = useRef(1);
  const containerRef = useRef<View>(null);
  const latestSeek = useRef(onSeek);
  latestSeek.current = onSeek;
  const lastRatio = useRef(0);
  const safeDuration = Math.max(0, duration || 0);
  const safeCurrentTime = Math.max(0, Math.min(safeDuration, currentTime || 0));
  const durationRef = useRef(safeDuration);
  durationRef.current = safeDuration;
  const currentTimeRef = useRef(safeCurrentTime);
  currentTimeRef.current = safeCurrentTime;
  const keyboardFocused = useRef(false);
  const bars = useMemo(() => normalizeBars(waveformData), [waveformData]);

  const seekTo = (seconds: number) => latestSeek.current(Math.max(0, Math.min(safeDuration, seconds)));
  const ratioFromPageX = (pageX: number) => Math.max(0, Math.min(1, (pageX - originX.current) / width.current));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const ratio = ratioFromPageX(event.nativeEvent.pageX);
        lastRatio.current = ratio;
        setDragRatio(ratio);
      },
      onPanResponderMove: (event) => {
        const ratio = ratioFromPageX(event.nativeEvent.pageX);
        lastRatio.current = ratio;
        setDragRatio(ratio);
      },
      onPanResponderRelease: () => {
        latestSeek.current(lastRatio.current * durationRef.current);
        setDragRatio(null);
      },
      onPanResponderTerminate: () => setDragRatio(null),
    }),
  ).current;

  const shown = dragRatio ?? (safeDuration > 0 ? safeCurrentTime / safeDuration : 0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardFocused.current) return;
      const { key } = event;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) return;
      event.preventDefault();
      const current = currentTimeRef.current;
      const total = durationRef.current;
      if (key === 'Home') latestSeek.current(0);
      else if (key === 'End') latestSeek.current(total);
      else if (key === 'PageUp') latestSeek.current(Math.min(total, current + SEEK_STEP_SECONDS * 6));
      else if (key === 'PageDown') latestSeek.current(Math.max(0, current - SEEK_STEP_SECONDS * 6));
      else latestSeek.current(Math.max(0, Math.min(total, current + (key === 'ArrowRight' || key === 'ArrowUp' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS))));
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return (
    <View>
      <View
        ref={containerRef}
        accessible
        focusable
        tabIndex={0}
        role="slider"
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityHint="Use arrow keys or swipe up and down to seek by five seconds."
        accessibilityValue={{ min: 0, max: Math.round(safeDuration), now: Math.round(safeCurrentTime), text: `${formatTime(safeCurrentTime)} of ${formatTime(safeDuration)}` }}
        accessibilityActions={[{ name: 'increment', label: 'Seek forward 5 seconds' }, { name: 'decrement', label: 'Seek back 5 seconds' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') seekTo(safeCurrentTime + SEEK_STEP_SECONDS);
          if (event.nativeEvent.actionName === 'decrement') seekTo(safeCurrentTime - SEEK_STEP_SECONDS);
        }}
        onFocus={() => { keyboardFocused.current = true; }}
        onBlur={() => { keyboardFocused.current = false; }}
        style={styles.row}
        onLayout={() => {
          containerRef.current?.measureInWindow((x, _y, measuredWidth) => {
            originX.current = x;
            width.current = Math.max(1, measuredWidth);
          });
        }}
        {...panResponder.panHandlers}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bars}>
          {bars.map((amplitude, index) => {
            const played = index / (BAR_COUNT - 1) <= shown;
            return (
              <View
                key={index}
                style={[
                  styles.bar,
                  {
                    height: MIN_BAR + amplitude * (MAX_BAR - MIN_BAR),
                    backgroundColor: played ? activeColor : glass.strokeStrong,
                  },
                  played && dragRatio !== null ? styles.barDragging : null,
                ]}
              />
            );
          })}
        </View>
      </View>
      {!waveformData?.length ? <Text style={styles.fallbackLabel}>Decorative rhythm · analyzed waveform unavailable</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 56, justifyContent: 'center', paddingVertical: 8, borderRadius: radii.sm },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flex: 1, marginHorizontal: 1.5, borderRadius: radii.pill },
  barDragging: { backgroundColor: colors.violet },
  fallbackLabel: { ...typography.caption, fontSize: 9, lineHeight: 12, color: colors.textMuted, textAlign: 'center' },
});
