import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { palette } from '../../theme/theme';

type Props = {
  size?: number;
  /** Render the mark as a single flat colour for themed Android/UI surfaces. */
  monochrome?: string;
};

/**
 * A radiant star settling into a record-like signal disc above two pine
 * ridges. The star survives favicon size, the grooves establish the music
 * cue, and the V-notch keeps the silhouette specific to Starhollow.
 * Geometry mirrors scripts/generate-brand-assets.js so native and web launch
 * surfaces stay pixel-consistent with the in-app mark.
 */
export function BrandMark({ size = 32, monochrome }: Props) {
  const star = monochrome ?? palette.gold;
  const ridgeNear = monochrome ?? '#03120F';
  const ridgeFar = monochrome ?? '#0B3028';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {!monochrome && (
        <Defs>
          <LinearGradient id="sh-disc" x1={16} y1={12} x2={82} y2={90} gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#173A3B" stopOpacity={0.94} />
            <Stop offset="55%" stopColor="#0A1B24" stopOpacity={0.97} />
            <Stop offset="100%" stopColor="#050B12" stopOpacity={0.99} />
          </LinearGradient>
          <LinearGradient id="sh-rim" x1={14} y1={12} x2={86} y2={90} gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#FFF7DE" stopOpacity={0.3} />
            <Stop offset="42%" stopColor={palette.primary} stopOpacity={0.68} />
            <Stop offset="100%" stopColor={palette.primary} stopOpacity={0.12} />
          </LinearGradient>
          <LinearGradient id="sh-star" x1={50} y1={10} x2={50} y2={67} gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#FFF7DE" />
            <Stop offset="44%" stopColor={palette.gold} />
            <Stop offset="100%" stopColor="#C9953F" />
          </LinearGradient>
          <RadialGradient id="sh-glow" cx="50%" cy="39%" r="44%">
            <Stop offset="0%" stopColor={palette.gold} stopOpacity={0.42} />
            <Stop offset="100%" stopColor={palette.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
      )}

      <Circle
        cx={50}
        cy={50}
        r={monochrome ? 40 : 42}
        fill={monochrome ? 'none' : 'url(#sh-disc)'}
        stroke={monochrome ?? 'url(#sh-rim)'}
        strokeWidth={monochrome ? 3 : 1.35}
        opacity={monochrome ? 0.72 : 1}
      />
      {!monochrome && <Circle cx={50} cy={39} r={31} fill="url(#sh-glow)" />}
      {[32, 25, 18].map((radius, index) => (
        <Circle
          key={radius}
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke={monochrome ?? palette.primary}
          strokeWidth={index === 0 ? 0.8 : index === 1 ? 0.7 : 0.6}
          opacity={monochrome ? [0.34, 0.24, 0.18][index] : [0.18, 0.13, 0.1][index]}
        />
      ))}
      <Path
        d="M11,77 L27,54 L39,68 L50,57 L61,68 L73,54 L89,77 L89,89 L11,89 Z"
        fill={ridgeFar}
        opacity={monochrome ? 0.68 : 1}
      />
      <Path
        d="M11,84 L28,67 L42,80 L50,73 L58,80 L72,67 L89,84 L89,91 L11,91 Z"
        fill={ridgeNear}
      />
      <Path
        d="M50,10 C51.4,21 52.7,28 55.5,32 C61,34.3 68.5,35.8 78,37 C68.5,38.4 61,39.8 55.5,42 C52.8,47 51.5,55 50,67 C48.5,55 47.2,47 44.5,42 C39,39.8 31.5,38.4 22,37 C31.5,35.8 39,34.3 44.5,32 C47.3,28 48.6,21 50,10 Z"
        fill={monochrome ? star : 'url(#sh-star)'}
      />
      {!monochrome && (
        <Path
          d="M50,27 C50.7,32.2 51.3,34.4 53,36.5 C55.6,37.3 57.8,37.8 61,38.5 C57.8,39.2 55.6,39.7 53,40.5 C51.4,42.7 50.8,45 50,50 C49.2,45 48.6,42.7 47,40.5 C44.4,39.7 42.2,39.2 39,38.5 C42.2,37.8 44.4,37.3 47,36.5 C48.7,34.4 49.3,32.2 50,27 Z"
          fill="#FFF7DE"
          opacity={0.92}
        />
      )}
      <Circle cx={24} cy={24} r={1.45} fill={star} opacity={0.72} />
      <Circle cx={76} cy={20} r={1.05} fill={star} opacity={0.5} />
    </Svg>
  );
}

export default BrandMark;
