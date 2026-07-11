import { Platform, StyleProp, Text, TextStyle } from 'react-native';

import { colors } from '../../theme/tokens';

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  /** Passing colours opts into a gradient. The default is solid hierarchy. */
  colors?: readonly [string, string, ...string[]];
  numberOfLines?: number;
  accessibilityLabel?: string;
};

export function GradientText({ children, style, colors: fill, numberOfLines, accessibilityLabel }: Props) {
  if (!fill || Platform.OS !== 'web') {
    return (
      <Text accessibilityLabel={accessibilityLabel} numberOfLines={numberOfLines} style={[{ color: fill?.[0] ?? colors.textPrimary }, style]}>
        {children}
      </Text>
    );
  }

  const webGradient = {
    backgroundImage: `linear-gradient(96deg, ${fill.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  } as unknown as TextStyle;
  return (
    <Text accessibilityLabel={accessibilityLabel} numberOfLines={numberOfLines} style={[style, webGradient]}>
      {children}
    </Text>
  );
}
