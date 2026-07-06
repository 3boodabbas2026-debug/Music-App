import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackground } from '../components/ui/AuroraBackground';
import { GradientText } from '../components/ui/GradientText';
import { streamUrl } from '../services/api/library';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useLibraryStore } from '../store/libraryStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPlayer'>;

export function VideoPlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const media = useLibraryStore((s) => s.items.find((m) => m.id === route.params.mediaId));
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!media) return;
      const token = await tokenStorage.getAccessToken();
      const url = token
        ? `${streamUrl(media.id)}?token=${encodeURIComponent(token)}`
        : streamUrl(media.id);
      if (alive) setSourceUrl(url);
    })();
    return () => {
      alive = false;
    };
  }, [media]);

  useEffect(() => {
    if (!sourceUrl) return;
    player.replaceAsync(sourceUrl).then(() => player.play()).catch(() => {});
  }, [sourceUrl, player]);

  if (!media) {
    navigation.goBack();
    return null;
  }

  return (
    <View style={styles.root}>
      <AuroraBackground />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>VIDEO</Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.stage}>
        {sourceUrl ? (
          <VideoView
            player={player}
            style={styles.video}
            nativeControls
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : (
          <ActivityIndicator color={colors.cyan} />
        )}
      </View>

      <View style={[styles.meta, { paddingBottom: insets.bottom + spacing.lg }]}>
        <GradientText numberOfLines={1} style={styles.title}>
          {media.title ?? media.recognized_title ?? 'Untitled'}
        </GradientText>
        <Text numberOfLines={1} style={styles.artist}>
          {media.artist ?? media.recognized_artist ?? 'Unknown source'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060B18',
  },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(30,41,59,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  chipLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  topSpacer: { width: 40 },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  meta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  title: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  artist: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
