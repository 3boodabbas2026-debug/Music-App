import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors, radii } from '../../theme/tokens';

const BAR_COUNT = 40;
const MAX_BAR = 40;
const MIN_BAR = 8;

/** Deterministic PRNG so each track always shows the same waveform silhouette. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Props = {
  /** Stable key (media id) that shapes the waveform silhouette. */
  seedKey: string;
  /** Live playback progress 0..1. */
  progress: number;
  /** Called with the chosen 0..1 position when a drag or tap ends. */
  onSeekRatio: (ratio: number) => void;
};

/**
 * A faux-waveform scrubber: drag anywhere across the bars to scrub, release to
 * seek. The silhouette is decorative (seeded per track); the position is real.
 */
export function WaveformScrubber({ seedKey, progress, onSeekRatio }: Props) {
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const originX = useRef(0);
  const width = useRef(1);
  const containerRef = useRef<View>(null);
  const latestSeek = useRef(onSeekRatio);
  latestSeek.current = onSeekRatio;
  const lastRatio = useRef(0);

  const bars = useMemo(() => {
    const rand = mulberry32(hashString(seedKey));
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      // Blend noise with a gentle arc so the shape reads as "a song".
      const arc = Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
      const noise = rand();
      return MIN_BAR + (0.35 * arc + 0.65 * noise) * (MAX_BAR - MIN_BAR);
    });
  }, [seedKey]);

  const ratioFromPageX = (pageX: number) =>
    Math.max(0, Math.min(1, (pageX - originX.current) / width.current));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const ratio = ratioFromPageX(evt.nativeEvent.pageX);
        lastRatio.current = ratio;
        setDragRatio(ratio);
      },
      onPanResponderMove: (evt) => {
        const ratio = ratioFromPageX(evt.nativeEvent.pageX);
        lastRatio.current = ratio;
        setDragRatio(ratio);
      },
      onPanResponderRelease: () => {
        latestSeek.current(lastRatio.current);
        setDragRatio(null);
      },
      onPanResponderTerminate: () => setDragRatio(null),
    }),
  ).current;

  const shown = dragRatio ?? Math.max(0, Math.min(1, progress));

  return (
    <View
      ref={containerRef}
      style={styles.row}
      onLayout={() => {
        containerRef.current?.measureInWindow((x, _y, w) => {
          originX.current = x;
          width.current = Math.max(1, w);
        });
      }}
      {...panResponder.panHandlers}
    >
      {bars.map((height, i) => {
        const played = i / (BAR_COUNT - 1) <= shown;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height,
                backgroundColor: played ? colors.cyan : 'rgba(233,229,220,0.25)',
              },
              played && dragRatio !== null ? styles.barDragging : null,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingVertical: 8,
  },
  bar: {
    flex: 1,
    marginHorizontal: 1.5,
    borderRadius: radii.pill,
  },
  barDragging: {
    backgroundColor: colors.violet,
  },
});
