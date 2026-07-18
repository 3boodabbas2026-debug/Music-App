import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { toast } from '../store/toastStore';
import { colors, glass, gradients, numericTypography, radii, spacing, typography } from '../theme/tokens';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';
import type { RootStackParamList } from '../navigation/types';

const RANGE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

/** A private, on-device listening recap. No playback history leaves the phone. */
export function ReplayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const libraryItems = useLibraryStore((state) => state.items);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const events = usePlayHistoryStore((state) => state.events);
  const [range, setRange] = useState('30');
  const windowDays = Number(range);
  const libraryIds = useMemo(() => new Set(libraryItems.map((media) => media.id)), [libraryItems]);
  const { topTracks, topArtists, minutes, previousMinutes } = useMemo(() => {
    const now = Date.now();
    const span = windowDays * 86400000;
    const current = events.filter((event) => libraryIds.has(event.mediaId) && event.at >= now - span);
    const previous = events.filter((event) => libraryIds.has(event.mediaId) && event.at >= now - span * 2 && event.at < now - span);
    const byTrack = new Map<string, { event: (typeof events)[number]; count: number }>();
    const byArtist = new Map<string, number>();
    for (const event of current) {
      const existing = byTrack.get(event.mediaId);
      if (existing) existing.count += 1;
      else byTrack.set(event.mediaId, { event, count: 1 });
      byArtist.set(event.artist, (byArtist.get(event.artist) ?? 0) + 1);
    }
    return {
      topTracks: [...byTrack.values()].sort((a, b) => b.count - a.count || b.event.at - a.event.at).slice(0, 10),
      topArtists: [...byArtist.entries()].map(([artist, count]) => ({ artist, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      minutes: Math.round(current.reduce((sum, event) => sum + (event.durationSeconds || 180), 0) / 60),
      previousMinutes: Math.round(previous.reduce((sum, event) => sum + (event.durationSeconds || 180), 0) / 60),
    };
  }, [events, libraryIds, windowDays]);
  const hours = Math.floor(minutes / 60);
  const comparison = previousMinutes === 0
    ? (minutes > 0 ? 'A fresh listening streak' : 'No change from the previous window')
    : `${Math.abs(Math.round(((minutes - previousMinutes) / previousMinutes) * 100))}% ${minutes >= previousMinutes ? 'more' : 'less'} than the previous ${windowDays} days`;

  async function playTrack(mediaId: string) {
    const media = libraryItems.find((item) => item.id === mediaId);
    if (!media) return;
    await playQueue([media], 0);
    navigation.navigate('Player');
  }

  async function playAll() {
    const ranked = topTracks
      .map((entry) => libraryItems.find((item) => item.id === entry.event.mediaId))
      .filter((media): media is NonNullable<typeof media> => !!media && media.media_type === 'audio');
    if (ranked.length === 0) return;
    await playQueue(ranked, 0);
    navigation.navigate('Player', { panel: 'queue' });
  }

  async function shareReplay() {
    const leaders = topTracks.slice(0, 5).map((entry, index) => `${index + 1}. ${entry.event.title} — ${entry.count} plays`).join('\n');
    try {
      await Share.share({ message: `My Starhollow Replay · ${windowDays} days\n${minutes} minutes listened\n${comparison}\n\n${leaders}` });
    } catch {
      toast("Couldn't open sharing.", 'error');
    }
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={720}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
            <SectionHeader
              eyebrow="Your Replay"
              title={`Last ${windowDays} days`}
              subtitle="Built entirely from what plays on this device. Nothing leaves your library."
              style={styles.heroHeader}
              titleStyle={styles.hero}
            />
          </View>

          <SegmentedControl
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            accessibilityLabel="Replay time range"
            style={styles.rangeControl}
          />

          <GlassPanel variant="modal" style={styles.poster}>
            <LinearGradient pointerEvents="none" colors={gradients.celebratorySheen} style={styles.posterSheen} />
            <View style={styles.posterContent}>
              <View style={styles.posterMasthead}>
                <Text style={styles.posterEyebrow}>LISTENING TIME</Text>
                <Ionicons name="sparkles" size={17} color={colors.gold} />
              </View>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.posterMetric}>
                {hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`}
              </Text>
              <View style={styles.comparisonLine}>
                <View style={styles.comparisonStar}><Ionicons name="star" size={10} color={colors.gold} /></View>
                <Text style={styles.comparison}>{comparison}</Text>
              </View>
              <View style={styles.supportingStats}>
                <View style={styles.supportingStat}>
                  <Text style={styles.statValue}>{topTracks.reduce((sum, track) => sum + track.count, 0)}</Text>
                  <Text style={styles.statLabel}>plays counted</Text>
                </View>
                <View style={styles.posterRule} />
                <View style={styles.supportingStat}>
                  <Text style={styles.statValue}>{topArtists.length}</Text>
                  <Text style={styles.statLabel}>artists in rotation</Text>
                </View>
              </View>
            </View>
          </GlassPanel>

          {topTracks.length === 0 ? (
            <View style={styles.emptyBody}>
              <EmptyState
                icon="sparkles-outline"
                motif="record"
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
              <View style={styles.actions}>
                <Button label="Play all" icon="play" onPress={() => void playAll()} style={styles.actionButton} />
                <Button label="Share recap" icon="share-outline" variant="ghost" onPress={() => void shareReplay()} style={styles.actionButton} />
              </View>
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
                          <Text style={[styles.rank, index === 0 && styles.rankLeader]}>{index + 1}</Text>
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
                          <Ionicons name="play-circle" size={20} color={colors.cyan} />
                          <View style={[styles.countChip, index === 0 && styles.countChipLeader]}>
                            <Text style={[styles.countText, index === 0 && styles.countTextLeader]}>{entry.count}×</Text>
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
                          <Text style={[styles.rank, index === 0 && styles.rankLeader]}>{index + 1}</Text>
                          <Text numberOfLines={1} style={[styles.trackTitle, styles.trackCopy]}>
                            {entry.artist}
                          </Text>
                          <View style={[styles.countChip, index === 0 && styles.countChipLeader]}>
                            <Text style={[styles.countText, index === 0 && styles.countTextLeader]}>{entry.count} plays</Text>
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
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xl },
  heroHeader: { flex: 1 },
  hero: { ...typography.display, fontSize: 30, lineHeight: 37 },
  rangeControl: { marginBottom: spacing.lg },
  poster: { marginBottom: spacing.xl, borderRadius: radii.hero, borderColor: glass.strokeModal },
  posterSheen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.14 },
  posterContent: { padding: spacing.xl, gap: spacing.md },
  posterMasthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  posterEyebrow: { ...typography.eyebrow, color: colors.gold },
  posterMetric: { ...typography.display, fontSize: 52, lineHeight: 60, letterSpacing: -2, color: colors.textPrimary },
  comparisonLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  comparisonStar: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surfaceElevated,
  },
  supportingStats: { flexDirection: 'row', alignItems: 'stretch', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: glass.stroke },
  supportingStat: { flex: 1, gap: spacing.xs },
  posterRule: { width: 1, marginHorizontal: spacing.md, backgroundColor: glass.stroke },
  statValue: { ...numericTypography.total, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textMuted },
  comparison: { ...typography.body, flex: 1, color: colors.textSecondary },
  emptyBody: { flex: 1, justifyContent: 'center' },
  sectionHeader: { marginBottom: spacing.sm },
  artistSection: { marginTop: spacing.xl },
  sectionTitle: { ...typography.title, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  list: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionButton: { flex: 1 },
  trackRow: { width: '100%', borderRadius: radii.lg },
  artistRow: { borderRadius: radii.lg },
  trackContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  trackCopy: { flex: 1, minWidth: 0 },
  rank: { ...numericTypography.rank, color: colors.textMuted, width: 20 },
  rankLeader: { color: colors.gold },
  trackTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  trackArtist: { ...typography.caption, color: colors.textMuted },
  countChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
  },
  countChipLeader: { borderWidth: 1, borderColor: colors.gold },
  countText: { ...numericTypography.total, fontSize: 11, lineHeight: 16, letterSpacing: 0.1, color: colors.textSecondary },
  countTextLeader: { color: colors.gold },
});
