import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { gradients, palette } from '../../theme/theme';
import { usePlayerStore } from '../../store/playerStore';

/**
 * The app's ambient backdrop — a living night-forest sky. A field of
 * twinkling stars, two aurora ribbons drifting at the edges, a soft moon
 * glow breathing in the upper corner, an occasional shooting star, and a
 * pine treeline silhouette grounding the bottom edge (the same treeline as
 * the brand mark). Restrained on purpose: it sits behind every screen's
 * real content, so everything here stays low-opacity, slow and quiet.
 *
 * Performance: the ~50 stars don't animate individually — they share three
 * looping "twinkle channels" and each star just interpolates one of them,
 * so the whole sky costs 3 running animations, not 50.
 */

/** Deterministic PRNG so the sky doesn't reshuffle between mounts. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type StarSpec = {
  id: number;
  /** Position as percentages so stars survive any screen size. */
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  channel: number;
  color: string;
};

const STAR_COUNT = 48;

function makeStars(): StarSpec[] {
  const rand = mulberry32(20260708);
  const stars: StarSpec[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const roll = rand();
    stars.push({
      id: i,
      x: rand() * 100,
      // Keep stars out of the treeline band at the bottom.
      y: rand() * 82,
      size: roll > 0.92 ? 2.5 : roll > 0.7 ? 2 : 1.5,
      baseOpacity: 0.14 + rand() * 0.4,
      channel: Math.floor(rand() * 3),
      // Mostly moon-silver, with a rare teal or gold spark.
      color: roll > 0.94 ? palette.gold : roll > 0.86 ? palette.primary : palette.textPrimary,
    });
  }
  return stars;
}

function useLoop(duration: number, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay]);
  return value;
}

function StarField() {
  const stars = useMemo(makeStars, []);
  // Three shared twinkle channels at different tempos — each star rides one.
  const channels = [useLoop(2600), useLoop(3900, 700), useLoop(5400, 1600)];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star) => (
        <Animated.View
          key={star.id}
          style={{
            position: 'absolute',
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            borderRadius: star.size / 2,
            backgroundColor: star.color,
            opacity: channels[star.channel].interpolate({
              inputRange: [0, 1],
              outputRange: [star.baseOpacity * 0.35, star.baseOpacity],
            }),
          }}
        />
      ))}
    </View>
  );
}

/** A soft ribbon of aurora light that drifts slowly and breathes. */
function AuroraRibbon({
  colors,
  width,
  height,
  x,
  right,
  y,
  rotate,
  duration,
  drift,
  ampBoost,
}: {
  colors: readonly [string, string];
  width: number;
  height: number;
  x?: number;
  right?: number;
  y: number;
  rotate: string;
  duration: number;
  drift: number;
  /** Multiplies the ribbon's opacity — 1 at rest, up to ~1.3 while music plays loudly. */
  ampBoost: Animated.AnimatedInterpolation<number>;
}) {
  const t = useLoop(duration);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        right,
        top: y,
        width,
        height,
        opacity: Animated.multiply(t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 1, 0.55] }), ampBoost),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -drift * 0.4] }) },
          { rotate },
        ],
      }}
    >
      <LinearGradient colors={[...colors]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, borderRadius: height / 2 }} />
    </Animated.View>
  );
}

/** Faint moonlight pooling in the upper corner, breathing very slowly. */
function MoonGlow({ ampBoost }: { ampBoost: Animated.AnimatedInterpolation<number> }) {
  const t = useLoop(9000);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -240,
        right: -200,
        width: 560,
        height: 560,
        opacity: Animated.multiply(t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }), ampBoost),
      }}
    >
      <Svg width={560} height={560}>
        <Defs>
          <RadialGradient id="rf-moonglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.textPrimary} stopOpacity={0.1} />
            <Stop offset="45%" stopColor={palette.primary} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={palette.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={280} cy={280} r={280} fill="url(#rf-moonglow)" />
      </Svg>
    </Animated.View>
  );
}

/** A soft colored wash centered on the sky, cross-fading in when the current
 * track's extracted accent color is known (web only — see useTrackAccent)
 * and fading back out otherwise. Purely additive: the rest of the sky's
 * teal/violet palette is untouched, this just layers a hint of the track's
 * own color on top. */
function AccentWash({ accentColor }: { accentColor?: string | null }) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: accentColor ? 1 : 0,
      duration: 900,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [accentColor, opacity]);

  const size = Math.max(width, height) * 1.3;
  const color = accentColor ?? palette.primary;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: width / 2 - size / 2,
        top: height / 2 - size / 2,
        width: size,
        height: size,
        opacity,
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rf-accent-wash" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.16} />
            <Stop offset="55%" stopColor={color} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#rf-accent-wash)" />
      </Svg>
    </Animated.View>
  );
}

/** A star darting across the upper sky every so often — blink and you miss it. */
function ShootingStar() {
  const progress = useRef(new Animated.Value(0)).current;
  const [origin, setOrigin] = useState({ x: 80, y: 60 });
  const { width } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const rand = mulberry32(Date.now() & 0xffff);

    function run() {
      if (cancelled) return;
      // New origin re-renders the streak in place, then the dart begins.
      setOrigin({ x: 40 + rand() * Math.max(120, width - 320), y: 30 + rand() * 160 });
      progress.setValue(0);
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          // Rare on purpose — a once-in-a-while reward, not a screensaver.
          timer = setTimeout(run, 12000 + rand() * 18000);
        });
      }, 50);
    }
    timer = setTimeout(run, 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [progress, width]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: origin.x,
        top: origin.y,
        width: 90,
        height: 1.5,
        borderRadius: 1,
        backgroundColor: palette.textPrimary,
        opacity: progress.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.7, 0.35, 0] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 190] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 64] }) },
          { rotate: '18.6deg' },
        ],
      }}
    />
  );
}

/** Two overlapping pine treelines along the bottom — depth, barely-there. */
function Treeline() {
  // Jagged peaks across a 100 x 26 viewBox, mirroring the brand mark's pines.
  const back = 'M0,26 L0,17 L7,10 L13,17 L19,9 L26,17 L33,11 L40,18 L47,8 L55,17 L62,12 L69,18 L76,9 L84,17 L91,12 L100,18 L100,26 Z';
  const front = 'M0,26 L0,21 L9,13 L17,21 L24,15 L32,22 L41,12 L50,21 L58,16 L66,22 L75,13 L83,21 L90,17 L100,22 L100,26 Z';
  return (
    <View pointerEvents="none" style={styles.treeline}>
      <Svg width="100%" height="100%" viewBox="0 0 100 26" preserveAspectRatio="none">
        <Path d={back} fill="#0A1410" opacity={0.9} />
        <Path d={front} fill="#050805" />
        {/* A breath of teal mist resting on the treetops. */}
        <Rect x="0" y="6" width="100" height="12" fill={palette.primary} opacity={0.02} />
      </Svg>
    </View>
  );
}

type RingSpec = {
  id: string;
  size: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  duration: number;
};

const RINGS: RingSpec[] = [
  { id: 'signal', size: 620, color: '#2FBFAA', opacity: 0.05, x: -180, y: -160, duration: 32000 },
  { id: 'wave', size: 720, color: '#9B8FD9', opacity: 0.045, x: 220, y: 420, duration: 40000 },
];

function Ring({ spec }: { spec: RingSpec }) {
  const pulse = useLoop(spec.duration);
  const r = spec.size / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: spec.x,
        top: spec.y,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [spec.opacity, spec.opacity * 1.4, spec.opacity] }),
      }}
    >
      <Svg width={spec.size} height={spec.size}>
        <Circle cx={r} cy={r} r={r - 40} stroke={spec.color} strokeWidth={1.5} fill="none" />
        <Circle cx={r} cy={r} r={r - 100} stroke={spec.color} strokeWidth={1} fill="none" />
      </Svg>
    </Animated.View>
  );
}

type RippleFieldProps = {
  /** Lowers the base sky wash's opacity so content mounted behind this
   * component (the Player's blurred cover-art backdrop) shows through, while
   * stars/aurora/treeline still render on top at full strength for continuity.
   * Only ever passed from PlayerScreen. */
  dimmed?: boolean;
  /** The current track's extracted accent color (web only — see
   * useTrackAccent). When present, washes the sky with a hint of that color;
   * when absent (native, or nothing playing) the sky stays its default
   * teal/violet, unchanged from before this prop existed. */
  accentColor?: string | null;
};

/** Takes no required props, so parent re-renders (e.g. a screen re-rendering
 * on a playback tick) never cascade into re-running this component's own 8
 * animation loops / 48 star views — React.memo's default shallow prop
 * compare handles the two optional props above, which only ever change once
 * per track, not per tick. */
export const RippleField = memo(function RippleField({ dimmed, accentColor }: RippleFieldProps) {
  const { height } = useWindowDimensions();
  // The amplitude signal ticks many times a second while a track plays (the
  // same source driving MiniPlayerBar's EQ bars and Moonlight). Reading it
  // via the store's imperative `subscribe` and feeding an Animated.Value —
  // rather than the `usePlayerStore` React hook — means the sky brightens in
  // time with the music without ever triggering a React re-render here.
  const ampValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe((state) => {
      const target = state.playing ? Math.max(0, Math.min(1, state.amplitude * 2.2)) : 0;
      Animated.timing(ampValue, { toValue: target, duration: 140, useNativeDriver: true }).start();
    });
    return unsubscribe;
  }, [ampValue]);
  const ampBoost = ampValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });

  return (
    <View pointerEvents="none" style={[styles.root, dimmed && styles.rootDimmed]}>
      <LinearGradient colors={gradients.screenIdle} style={[StyleSheet.absoluteFill, dimmed && styles.dimmedSky]} />
      <AccentWash accentColor={accentColor} />
      <MoonGlow ampBoost={ampBoost} />
      <AuroraRibbon
        colors={gradients.rippleSignal}
        width={520}
        height={900}
        x={-260}
        y={-120}
        rotate="24deg"
        duration={16000}
        drift={70}
        ampBoost={ampBoost}
      />
      <AuroraRibbon
        colors={gradients.rippleWave}
        width={460}
        height={820}
        right={-230}
        y={Math.max(120, height * 0.28)}
        rotate="-19deg"
        duration={21000}
        drift={-55}
        ampBoost={ampBoost}
      />
      {RINGS.map((spec) => (
        <Ring key={spec.id} spec={spec} />
      ))}
      <StarField />
      <ShootingStar />
      <Treeline />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: '#050805',
  },
  rootDimmed: {
    backgroundColor: 'transparent',
  },
  dimmedSky: {
    opacity: 0.45,
  },
  treeline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
});
