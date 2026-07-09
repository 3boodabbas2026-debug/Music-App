import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { EmptyState } from '../components/ui/EmptyState';
import { FadeImage } from '../components/ui/FadeImage';
import { GlassPanel } from '../components/ui/GlassPanel';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { RippleField } from '../components/ui/RippleField';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const WINDOW_DAYS = 30;

/** "Your Duskglen Replay" — a personal listening recap built entirely from
 * on-device history (no telemetry leaves the phone). Mirrors the spirit of
 * Apple Music's Replay, scoped honestly to what a self-hosted library can
 * actually know about you: what you played, how often, for how long. */
export function ReplayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const libraryItems = useLibraryStore((s) => s.items);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const events = usePlayHistoryStore((s) => s.events);
  const topEntriesInWindow = usePlayHistoryStore((s) => s.topEntriesInWindow);
  const topArtistsInWindow = usePlayHistoryStore((s) => s.topArtistsInWindow);
  const totalMinutesInWindow = usePlayHistoryStore((s) => s.totalMinutesInWindow);
  void events; // keeps this screen reactive as new plays land

  const topTracks = topEntriesInWindow(WINDOW_DAYS, 10).filter((entry) => libraryItems.some((m) => m.id === entry.event.mediaId));
  const topArtists = topArtistsInWindow(WINDOW_DAYS, 5);
  const minutes = totalMinutesInWindow(WINDOW_DAYS);
  const hours = Math.floor(minutes / 60);

  async function playTrack(mediaId: string) {
    const media = libraryItems.find((m) => m.id === mediaId);
    if (!media) return;
    await playQueue([media], 0);
    navigation.navigate('Player');
  }

  return (
    <View style={styles.root}>
      <RippleField />
      <ScreenContainer maxWidth={720}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Your Replay</Text>
            <View style={{ width: 22 }} />
          </View>

          <GradientText style={styles.hero}>{`Last ${WINDOW_DAYS} days`}</GradientText>
          <Text style={styles.tagline}>Built entirely from what's actually played on this device — nothing leaves your library.</Text>

          <View style={styles.statsRow}>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`}</Text>
              <Text style={styles.statLabel}>listened</Text>
            </GlassPanel>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{topTracks.reduce((sum, t) => sum + t.count, 0)}</Text>
              <Text style={styles.statLabel}>plays counted</Text>
            </GlassPanel>
            <GlassPanel style={styles.statTile}>
              <Text style={styles.statValue}>{topArtists.length}</Text>
              <Text style={styles.statLabel}>artists in rotation</Text>
            </GlassPanel>
          </View>

          {topTracks.length === 0 ? (
            <EmptyState
              icon="sparkles-outline"
              title="Nothing to replay yet"
              subtitle="Listen through a few tracks and your recap will start filling in here."
            />
          ) : (
            <>
              <Text style={styles.sectionTitle}>On repeat</Text>
              <View style={{ gap: spacing.sm }}>
                {topTracks.map((entry, i) => {
                  const media = libraryItems.find((m) => m.id === entry.event.mediaId);
                  return (
                    <PressableScale key={entry.event.mediaId} onPress={() => playTrack(entry.event.mediaId)} scaleTo={0.99}>
                      <GlassPanel style={styles.trackRow}>
                        <View style={styles.trackContent}>
                          <Text style={styles.rank}>{i + 1}</Text>
                          <View style={styles.cover}>
                            {media?.thumbnail_url ? (
                              <FadeImage uri={media.thumbnail_url} style={StyleSheet.absoluteFill as object} />
                            ) : (
                              <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={styles.trackTitle}>{entry.event.title}</Text>
                            <Text numberOfLines={1} style={styles.trackArtist}>{entry.event.artist}</Text>
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

              {topArtists.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Top artists</Text>
                  <View style={{ gap: spacing.sm }}>
                    {topArtists.map((entry, i) => (
                      <GlassPanel key={entry.artist} style={styles.artistRow}>
                        <View style={styles.trackContent}>
                          <Text style={styles.rank}>{i + 1}</Text>
                          <Text numberOfLines={1} style={[styles.trackTitle, { flex: 1 }]}>{entry.artist}</Text>
                          <View style={styles.countChip}>
                            <Text style={styles.countText}>{entry.count} plays</Text>
                          </View>
                        </View>
                      </GlassPanel>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050805' },
  scroll: { paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  hero: { ...typography.mega, fontSize: 32, lineHeight: 38, marginTop: spacing.sm },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statTile: { flex: 1, borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', gap: 2 },
  statValue: { ...typography.title, fontSize: 22, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.textMuted },
  sectionTitle: { ...typography.title, fontSize: 18, color: colors.textPrimary, marginBottom: spacing.sm },
  trackRow: { borderRadius: radii.lg },
  artistRow: { borderRadius: radii.lg },
  trackContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rank: { ...typography.title, fontSize: 16, color: colors.textMuted, width: 20, fontVariant: ['tabular-nums'] },
  cover: { width: 44, height: 44, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surface },
  trackTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  trackArtist: { ...typography.caption, color: colors.textMuted },
  countChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(47,191,170,0.14)',
  },
  countText: { ...typography.caption, fontSize: 11, color: colors.cyan, fontFamily: 'SpaceGrotesk_600SemiBold' },
});
