import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, glass, motion, numericTypography, radii, spacing, typography } from '../../theme/tokens';

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
    const window = data.slice(Math.max(0, sourceIndex - 2), Math.min(data.length, sourceIndex + 3));
    const peak = Math.max(...window.map((sample) => Math.abs(sample ?? 0)));
    const rms = Math.sqrt(window.reduce((sum, sample) => sum + Math.abs(sample ?? 0) ** 2, 0) / Math.max(1, window.length));
    return Math.max(0.08, Math.min(1, rms * 0.68 + peak * 0.32));
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
  const reduceMotion = useReducedMotion();
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
  const isAnalyzed = !!waveformData?.length;
  const bars = useMemo(() => normalizeBars(waveformData), [waveformData]);
  const smoothRatio = useRef(new Animated.Value(0)).current;

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
    smoothRatio.stopAnimation();
    if (reduceMotion) {
      smoothRatio.setValue(shown);
      return;
    }
    Animated.timing(smoothRatio, {
      toValue: shown,
      duration: dragRatio == null ? motion.duration.base : motion.duration.instant,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: false,
    }).start();
  }, [dragRatio, reduceMotion, shown, smoothRatio]);

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
    <View style={styles.instrument}>
      <View style={styles.readout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.time}>{formatTime(safeCurrentTime)}</Text>
        <View style={styles.signalLabelWrap}>
          <View style={[styles.signalDot, isAnalyzed && { backgroundColor: activeColor }]} />
          <Text style={styles.signalLabel}>{isAnalyzed ? 'ANALYZED SIGNAL' : 'SIGNAL GUIDE'}</Text>
        </View>
        <Text style={[styles.time, styles.timeEnd]}>{formatTime(safeDuration)}</Text>
      </View>
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
        {dragRatio !== null ? (
          <View
            pointerEvents="none"
            style={[styles.previewCapsule, { left: `${Math.max(0.07, Math.min(0.93, dragRatio)) * 100}%` }]}
          >
            <Text style={styles.previewText}>{formatTime(dragRatio * safeDuration)}</Text>
          </View>
        ) : null}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.bars, !isAnalyzed && styles.barsFallback]}
        >
          <View style={styles.baseline} />
          {bars.map((amplitude, index) => {
            const frontier = (index + 0.5) / BAR_COUNT;
            const before = Math.max(0, frontier - 0.012);
            const after = Math.min(1, frontier + 0.012);
            const baseHeight = MIN_BAR + amplitude * (MAX_BAR - MIN_BAR);
            return (
              <Animated.View
                key={index}
                style={[
                  styles.bar,
                  {
                    height: baseHeight,
                    backgroundColor: smoothRatio.interpolate({
                      inputRange: [before, frontier, after],
                      outputRange: [glass.strokeStrong, activeColor, activeColor],
                      extrapolate: 'clamp',
                    }),
                    transform: [{
                      scaleY: smoothRatio.interpolate({
                        inputRange: [0, frontier, 1],
                        outputRange: [0.92, 1.08, 1],
                        extrapolate: 'clamp',
                      }),
                    }],
                  },
                ]}
              />
            );
          })}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.frontier,
              {
                left: smoothRatio.interpolate({ inputRange: [0, 1], outputRange: ['1%', '99%'] }),
                backgroundColor: activeColor,
                borderColor: activeColor,
                opacity: dragRatio === null ? 0.72 : 1,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  instrument: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: glass.strokeStrong,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 },
  time: { ...numericTypography.time, minWidth: 44, color: colors.textSecondary },
  timeEnd: { textAlign: 'right' },
  signalLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  signalDot: { width: 4, height: 4, borderRadius: radii.pill, backgroundColor: colors.textMuted },
  signalLabel: { ...typography.eyebrow, fontSize: 8, lineHeight: 12, letterSpacing: 1.45, color: colors.textMuted },
  row: { height: 58, justifyContent: 'center', paddingVertical: 7, borderRadius: radii.sm },
  bars: { flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barsFallback: { opacity: 0.58, transform: [{ scaleY: 0.76 }] },
  baseline: { position: 'absolute', left: 0, right: 0, top: '50%', height: StyleSheet.hairlineWidth, backgroundColor: glass.strokeStrong },
  bar: { flex: 1, marginHorizontal: 1.5, borderRadius: radii.pill },
  frontier: {
    position: 'absolute',
    top: '50%',
    width: 7,
    height: 7,
    marginLeft: -3.5,
    marginTop: -3.5,
    borderRadius: radii.pill,
    borderWidth: 1,
    shadowColor: colors.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  previewCapsule: {
    position: 'absolute',
    top: -20,
    zIndex: 2,
    width: 58,
    minHeight: 24,
    marginLeft: -29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.fillHeavy,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  previewText: { ...typography.numeric, fontSize: 10, lineHeight: 14, color: colors.textPrimary },
});
