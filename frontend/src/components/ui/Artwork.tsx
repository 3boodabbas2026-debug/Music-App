import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { API_BASE_URL } from '../../config';
import { colors, radii } from '../../theme/tokens';
import { coverGlyphColor, coverGradient } from '../../utils/mediaDisplay';

export type ArtworkMedia = {
  id?: string | number | null;
  title?: string | null;
  recognized_title?: string | null;
  artist?: string | null;
  recognized_artist?: string | null;
  media_type?: 'audio' | 'video' | string | null;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  artwork_url?: string | null;
  artworkUrl?: string | null;
};

type Props = {
  media: ArtworkMedia | null | undefined;
  size?: number | '100%';
  style?: StyleProp<ViewStyle>;
  /** Prioritizes hero/now-playing art. Lists remain lazy by default. */
  priority?: boolean;
  accessibilityLabel?: string;
  borderRadius?: number;
};

function resolveUri(media: ArtworkMedia | null | undefined) {
  const raw = media?.thumbnail_url ?? media?.thumbnailUrl ?? media?.artwork_url ?? media?.artworkUrl ?? null;
  if (!raw) return null;
  return raw.startsWith('/') ? `${API_BASE_URL}${raw}` : raw;
}

/** Cached, recyclable cover art with a stable fallback and no layout shift. */
export function Artwork({
  media,
  size = 48,
  style,
  priority = false,
  accessibilityLabel,
  borderRadius = radii.sm,
}: Props) {
  const key = String(media?.id ?? resolveUri(media) ?? 'untitled');
  const uri = resolveUri(media);
  const title = media?.title ?? media?.recognized_title ?? 'Untitled track';
  const artist = media?.artist ?? media?.recognized_artist;
  const label = accessibilityLabel ?? `${title}${artist ? ` by ${artist}` : ''} artwork`;
  const dimensions: ViewStyle = { width: size, height: size };

  return (
    <View
      accessible={!uri}
      accessibilityRole={!uri ? 'image' : undefined}
      accessibilityLabel={!uri ? label : undefined}
      style={[styles.root, dimensions, { borderRadius }, style]}
    >
      <LinearGradient colors={[...coverGradient(key)]} style={StyleSheet.absoluteFill}>
        <View style={styles.fallbackIcon}>
          <Ionicons
            name={media?.media_type === 'video' ? 'play' : 'musical-note'}
            size={typeof size === 'number' ? Math.max(14, Math.min(30, size * 0.3)) : 24}
            color={coverGlyphColor(key)}
          />
        </View>
      </LinearGradient>
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={priority ? 'high' : 'normal'}
          loading={priority ? 'eager' : 'lazy'}
          recyclingKey={key}
          transition={priority ? 120 : 160}
          accessible
          accessibilityLabel={label}
          alt={label}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: colors.surfaceBright,
  },
  fallbackIcon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.78,
  },
});
