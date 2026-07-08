import Svg, { Ellipse, Rect } from 'react-native-svg';

import { palette } from '../../theme/theme';

type Props = {
  size?: number;
  /** Render every shape in one colour (for the Android monochrome adaptive icon, dark UI chrome, etc). */
  monochrome?: string;
};

/**
 * The Wavecairn mark: three stacked stones (an archive built one piece at a
 * time) with a single ripple beneath (the signal that reaches it). The top
 * stone carries the accent colour so the mark still reads at favicon size.
 */
export function BrandMark({ size = 32, monochrome }: Props) {
  const top = monochrome ?? palette.primary;
  const body = monochrome ?? palette.textPrimary;
  const ripple = monochrome ?? palette.secondary;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={90} rx={30} ry={5} stroke={ripple} strokeWidth={2.5} fill="none" opacity={0.55} />
      <Rect x={18} y={61} width={64} height={20} rx={10} fill={body} />
      <Rect x={27} y={39} width={46} height={18} rx={9} fill={body} opacity={0.88} />
      <Rect x={35} y={19} width={30} height={16} rx={8} fill={top} />
    </Svg>
  );
}

export default BrandMark;
