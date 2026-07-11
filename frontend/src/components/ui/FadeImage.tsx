import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  priority?: boolean;
  accessibilityLabel?: string;
};

/**
 * Compatibility wrapper for legacy call sites, now backed by Expo Image's
 * memory/disk cache and native cross-dissolve instead of a JS opacity timer.
 */
export function FadeImage({ uri, style, resizeMode = 'cover', priority, accessibilityLabel }: Props) {
  return (
    <Image
      source={uri}
      style={style}
      contentFit={resizeMode}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={160}
      priority={priority ? 'high' : 'normal'}
      loading={priority ? 'eager' : 'lazy'}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
