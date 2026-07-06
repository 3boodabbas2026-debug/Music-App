import { Platform, Text, TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

import { gradients, palette } from '../../theme/theme';

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
  colors?: readonly [string, string, ...string[]];
  numberOfLines?: number;
};

/** Headline text filled with the aurora gradient (falls back to solid cyan on web, where masking is unreliable). */
export function GradientText({ children, style, colors = gradients.aurora, numberOfLines }: Props) {
  if (Platform.OS === 'web') {
    return (
      <Text numberOfLines={numberOfLines} style={[style, { color: palette.primary }]}>
        {children}
      </Text>
    );
  }

  return (
    <MaskedView
      maskElement={
        <Text numberOfLines={numberOfLines} style={[style, { backgroundColor: 'transparent' }]}>
          {children}
        </Text>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>
        <Text numberOfLines={numberOfLines} style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
