import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Artwork } from '../components/ui/Artwork';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';
import type { RootStackParamList } from '../navigation/types';

const WINDOW_DAYS = 30;

/** A private, on-device listening recap. No playback history leaves the phone. */
export function ReplayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const libraryItems = useLibraryStore((state) => state.items);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const events = usePlayHistoryStore((state) => state.events);
  const topEntriesInWindow = usePlayHistoryStore((state) => state.topEntriesInWindow);
  const topArtistsInWindow = usePlayHistoryStore((state) => state.topArtistsInWindow);
  const totalMinutesInWindow = usePlayHistoryStore((state) => state.totalMinutesInWindow);
  void events;

  const topTracks = topEntriesInWindow(WINDOW_DAYS, 10).filter((entry) =>
    libraryItems.some((media) => media.id === entry.event.mediaId),
  );
  const topArtists = topArtistsInWindow(WINDOW_DAYS, 5);
  const minutes = totalMinutesInWindow(WINDOW_DAYS);
  const hours = Math.floor(minutes / 60);

  async function playTrack(mediaId: string) {
    const media = libraryItems.find((item) => item.id === mediaId);
    if (!media) return;
    await playQueue([media], 0);
    navigation.navigate('Player');
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={720}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader
              eyebrow="Your Replay"
              title={`Last ${WINDOW_DAYS} days`}
              subtitle="Built entirely from what plays on this device. Nothing leaves your library."
              style={styles.heroHeader}
              titleStyle={styles.hero}
            />
          </View>

          <View style={styles.statsRow}>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`}</Text>
              <Text style={styles.statLabel}>listened</Text>
            </GlassPanel>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{topTracks.reduce((sum, track) => sum + track.count, 0)}</Text>
              <Text style={styles.statLabel}>plays counted</Text>
            </GlassPanel>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{topArtists.length}</Text>
              <Text style={styles.statLabel}>artists in rotation</Text>
            </GlassPanel>
          </View>

          {topTracks.length === 0 ? (
            <View style={styles.emptyBody}>
              <EmptyState
                icon="sparkles-outline"
                title="Nothing to replay yet"
                subtitle="Listen through a few tracks and your recap will start filling in here."
              />
            </View>
          ) : (
            <>
              <SectionHeader
                title="On repeat"
                subtitle="Your most-played tracks in this listening window."
                style={styles.sectionHeader}
                titleStyle={styles.sectionTitle}
              />
              <View style={styles.list}>
                {topTracks.map((entry, index) => {
                  const media = libraryItems.find((item) => item.id === entry.event.mediaId);
                  const title = media ? displayTitle(media) : entry.event.title;
                  return (
                    <PressableScale
                      key={entry.event.mediaId}
                      onPress={() => playTrack(entry.event.mediaId)}
                      accessibilityLabel={`Play ${title}`}
                      scaleTo={0.99}
                    >
                      <GlassPanel style={styles.trackRow}>
                        <View style={styles.trackContent}>
                          <Text style={styles.rank}>{index + 1}</Text>
                          <Artwork
                            media={media ?? { id: entry.event.mediaId, title: entry.event.title, artist: entry.event.artist }}
                            size={44}
                          />
                          <View style={styles.trackCopy}>
                            <Text numberOfLines={1} style={styles.trackTitle}>
                              {title}
                            </Text>
                            <Text numberOfLines={1} style={styles.trackArtist}>
                              {media ? displayArtist(media) ?? entry.event.artist : entry.event.artist}
                            </Text>
                          </View>
                          <View style={styles.countChip}>
                            <Text style={styles.countText}>{entry.count}×</Text>
                          </View>
                        </View>
                      </GlassPanel>
                    </PressableScale>
                  );
                })}
              </View>

              {topArtists.length > 0 ? (
                <>
                  <SectionHeader title="Top artists" style={[styles.sectionHeader, styles.artistSection]} titleStyle={styles.sectionTitle} />
                  <View style={styles.list}>
                    {topArtists.map((entry, index) => (
                      <GlassPanel key={entry.artist} style={styles.artistRow}>
                        <View style={styles.trackContent}>
                          <Text style={styles.rank}>{index + 1}</Text>
                          <Text numberOfLines={1} style={[styles.trackTitle, styles.trackCopy]}>
                            {entry.artist}
                          </Text>
                          <View style={styles.countChip}>
                            <Text style={styles.countText}>{entry.count} plays</Text>
                          </View>
                        </View>
                      </GlassPanel>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xl },
  heroHeader: { flex: 1 },
  hero: { ...typography.display, fontSize: 30, lineHeight: 37 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statTile: { flex: 1, borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', gap: 2 },
  statValue: { ...typography.title, fontSize: 21, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  emptyBody: { flex: 1, justifyContent: 'center' },
  sectionHeader: { marginBottom: spacing.sm },
  artistSection: { marginTop: spacing.xl },
  sectionTitle: { ...typography.title, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  list: { gap: spacing.sm },
  trackRow: { width: '100%', borderRadius: radii.lg },
  artistRow: { borderRadius: radii.lg },
  trackContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  trackCopy: { flex: 1, minWidth: 0 },
  rank: { ...typography.title, fontSize: 16, color: colors.textMuted, width: 20, fontVariant: ['tabular-nums'] },
  trackTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  trackArtist: { ...typography.caption, color: colors.textMuted },
  countChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
  },
  countText: { ...typography.caption, fontSize: 11, color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
});
