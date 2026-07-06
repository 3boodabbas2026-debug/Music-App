import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { EmptyState } from '../components/ui/EmptyState';
import { FadeImage } from '../components/ui/FadeImage';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Reveal } from '../components/ui/Reveal';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job, Media } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { toast } from '../store/toastStore';
import { colors, gradients, layout, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type MediaKind = 'audio' | 'video';

const AUDIO_FORMATS: { key: downloadsApi.AudioFormat; label: string }[] = [
  { key: 'mp3-192', label: 'MP3 192' },
  { key: 'mp3-320', label: 'MP3 320' },
  { key: 'm4a', label: 'M4A' },
  { key: 'source', label: 'Source' },
];

const VIDEO_QUALITIES: { key: downloadsApi.VideoQuality; label: string }[] = [
  { key: '1080p', label: '1080p' },
  { key: '720p', label: '720p' },
  { key: '2160p', label: '4K' },
  { key: 'source', label: 'Source' },
];

const RECENTS_LIMIT = 12;
const COVER_SIZE = 152;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late.';
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [url, setUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<MediaKind>('audio');
  const [audioFormat, setAudioFormat] = useState<downloadsApi.AudioFormat>('mp3-192');
  const [videoQuality, setVideoQuality] = useState<downloadsApi.VideoQuality>('1080p');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const unsubscribers = useRef<Map<string, () => void>>(new Map());
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const libraryItems = useLibraryStore((s) => s.items);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const updateJob = useCallback((job: Job) => {
    setJobs((prev) => {
      const index = prev.findIndex((j) => j.id === job.id);
      if (index === -1) return [job, ...prev];
      const next = [...prev];
      next[index] = job;
      return next;
    });
    if (job.status === 'complete' && job.result_media) {
      upsertMedia(job.result_media);
    }
  }, [upsertMedia]);

  async function startJob(sourceUrl: string) {
    const job = await downloadsApi.createDownload(sourceUrl, mediaKind, { audioFormat, videoQuality });
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    const unsubscribe = watchJob(job.id, (update) => {
      updateJob(update);
      if (update.status === 'complete') toast('Added to your library', 'success');
      if (update.status === 'failed') toast(update.error_message ?? 'Download failed', 'error');
      if (update.status === 'complete' || update.status === 'failed' || update.status === 'cancelled') {
        unsubscribers.current.get(job.id)?.();
        unsubscribers.current.delete(job.id);
      }
    });
    unsubscribers.current.set(job.id, unsubscribe);
  }

  async function handleSubmit() {
    if (!url.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await startJob(url.trim());
      setUrl('');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not start that download.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaste() {
    try {
      const text = await Clipboard.getStringAsync();
      if (text?.trim()) setUrl(text.trim());
      else toast('Clipboard is empty', 'info');
    } catch {
      toast("Couldn't read the clipboard", 'error');
    }
  }

  async function handleCancelJob(job: Job) {
    try {
      const updated = await downloadsApi.cancelDownload(job.id);
      updateJob(updated);
      toast('Download cancelled', 'info');
    } catch {
      toast("Couldn't cancel that download", 'error');
    }
  }

  async function handleRetryJob(job: Job) {
    if (!job.source_url) return;
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    try {
      await startJob(job.source_url);
    } catch {
      toast("Couldn't restart that download", 'error');
    }
  }

  function clearFinishedJobs() {
    setJobs((prev) => prev.filter((j) => j.status === 'pending' || j.status === 'in_progress'));
  }

  async function handlePlayRecent(media: Media) {
    if (media.media_type === 'video') {
      navigation.navigate('VideoPlayer', { mediaId: media.id });
      return;
    }
    await play(media);
    navigation.navigate('Player');
  }

  const recents = libraryItems.slice(0, RECENTS_LIMIT);

  return (
    <View style={styles.root}>
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Reveal>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>SUPERMEDIA</Text>
                <GradientText style={styles.megaTitle}>{greeting()}</GradientText>
                <Text style={styles.tagline}>Feed the vault — paste any link.</Text>
              </View>
              <SidebarTrigger />
            </View>
          </Reveal>

          <Reveal delay={80}>
          <GlassPanel style={styles.heroPanel}>
            <View style={styles.heroContent}>
              <View style={styles.inputCapsule}>
                <Ionicons name="link" size={18} color={colors.textMuted} />
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https:// TikTok · YouTube · anything"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.cyan}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable onPress={handlePaste} hitSlop={8} style={styles.pasteButton}>
                  <Ionicons name="clipboard-outline" size={17} color={colors.textMuted} />
                </Pressable>
                <PressableScale onPress={handleSubmit} disabled={!url.trim() || submitting} scaleTo={0.88}>
                  <LinearGradient
                    colors={colors.gradientPrimary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.goButton}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#0B1120" />
                    ) : (
                      <Ionicons name="arrow-forward" size={20} color="#0B1120" />
                    )}
                  </LinearGradient>
                </PressableScale>
              </View>

              <View style={styles.chipRow}>
                {(['audio', 'video'] as MediaKind[]).map((kind) => (
                  <Pressable
                    key={kind}
                    onPress={() => setMediaKind(kind)}
                    style={[styles.chip, mediaKind === kind && styles.chipActive]}
                  >
                    <Ionicons
                      name={kind === 'audio' ? 'musical-notes' : 'videocam'}
                      size={13}
                      color={mediaKind === kind ? colors.cyan : colors.textMuted}
                    />
                    <Text style={[styles.chipLabel, mediaKind === kind && styles.chipLabelActive]}>
                      {kind === 'audio' ? 'Audio' : 'Video'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.qualityRow}>
                {(mediaKind === 'audio' ? AUDIO_FORMATS : VIDEO_QUALITIES).map((option) => {
                  const active = mediaKind === 'audio' ? audioFormat === option.key : videoQuality === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() =>
                        mediaKind === 'audio'
                          ? setAudioFormat(option.key as downloadsApi.AudioFormat)
                          : setVideoQuality(option.key as downloadsApi.VideoQuality)
                      }
                      style={[styles.qualityChip, active && styles.chipActive]}
                    >
                      <Text style={[styles.qualityLabel, active && styles.chipLabelActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </GlassPanel>
          </Reveal>

          {jobs.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>In flight</Text>
                {jobs.some((j) => j.status !== 'pending' && j.status !== 'in_progress') && (
                  <Pressable onPress={clearFinishedJobs} hitSlop={8}>
                    <Text style={styles.sectionAction}>Clear finished</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.jobList}>
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCancel={() => handleCancelJob(job)}
                    onRetry={() => handleRetryJob(job)}
                  />
                ))}
              </View>
            </>
          )}

          <Reveal delay={150}>
          <Text style={styles.sectionTitle}>Fresh drops</Text>
          {recents.length === 0 ? (
            <EmptyState title="Nothing here yet" subtitle="Your latest downloads will land here." icon="cloud-download-outline" />
          ) : (
            <FlatList
              horizontal
              data={recents}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={COVER_SIZE + spacing.md}
              decelerationRate="fast"
              contentContainerStyle={styles.shelfContent}
              renderItem={({ item }) => (
                <CoverCard media={item} onPress={() => handlePlayRecent(item)} />
              )}
            />
          )}
          </Reveal>
        </ScrollView>
      </ScreenContainer>
      <MiniPlayerBar />
    </View>
  );
}

function sourceIcon(url: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'link';
  if (url.startsWith('telegram:')) return 'paper-plane';
  if (url.startsWith('ytsearch')) return 'search';
  if (/youtu\.?be/i.test(url)) return 'logo-youtube';
  if (/tiktok/i.test(url)) return 'logo-tiktok';
  if (/instagram/i.test(url)) return 'logo-instagram';
  return 'link';
}

function JobCard({ job, onCancel, onRetry }: { job: Job; onCancel: () => void; onRetry: () => void }) {
  const label = job.result_media?.title ?? job.source_url ?? 'Download';
  const running = job.status === 'in_progress' || job.status === 'pending';
  return (
    <GlassPanel style={styles.jobPanel}>
      <View style={styles.jobContent}>
        {running ? (
          <ProgressRing progress={job.progress_pct / 100} size={48} strokeWidth={4}>
            <Text style={styles.jobPct}>{Math.round(job.progress_pct)}</Text>
          </ProgressRing>
        ) : (
          <View style={[styles.jobBadge, job.status === 'failed' && styles.jobBadgeFailed]}>
            <Ionicons
              name={job.status === 'complete' ? 'checkmark' : job.status === 'failed' ? 'close' : 'remove'}
              size={20}
              color={job.status === 'failed' ? colors.danger : colors.success}
            />
          </View>
        )}
        <View style={styles.jobText}>
          <View style={styles.jobTitleRow}>
            <Ionicons name={sourceIcon(job.source_url)} size={13} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.jobTitle}>
              {label}
            </Text>
          </View>
          {running ? (
            <View style={styles.jobStageRow}>
              <ActivityIndicator size="small" color={colors.cyan} />
              <Text style={styles.jobStage}>{job.stage_label ?? 'starting'}…</Text>
            </View>
          ) : (
            <Text style={[styles.jobStage, job.status === 'failed' && styles.jobError]} numberOfLines={2}>
              {job.status === 'complete' ? 'Ready in your library' : job.status === 'failed' ? job.error_message : job.status}
            </Text>
          )}
        </View>
        {running && (
          <Pressable onPress={onCancel} hitSlop={8} style={styles.jobAction}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        {job.status === 'failed' && job.source_url && (
          <Pressable onPress={onRetry} hitSlop={8} style={styles.jobAction}>
            <Ionicons name="refresh" size={18} color={colors.cyan} />
          </Pressable>
        )}
      </View>
    </GlassPanel>
  );
}

function CoverCard({ media, onPress }: { media: Media; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95}>
      <View style={styles.coverCard}>
        {media.thumbnail_url ? (
          <FadeImage uri={media.thumbnail_url} style={StyleSheet.absoluteFill as object} />
        ) : (
          <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={gradients.coverScrim} style={styles.coverScrim} />
        {!media.thumbnail_url && (
          <View style={styles.coverGlyphWrap}>
            <Ionicons name="musical-notes" size={34} color="rgba(248,250,252,0.35)" />
          </View>
        )}
        <View style={styles.coverMeta}>
          <Text numberOfLines={1} style={styles.coverTitle}>
            {media.title ?? media.recognized_title ?? 'Untitled'}
          </Text>
          <Text numberOfLines={1} style={styles.coverArtist}>
            {media.artist ?? media.recognized_artist ?? 'Unknown artist'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
  scroll: { paddingBottom: layout.tabBarClearance },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  heroPanel: { marginBottom: spacing.md },
  heroContent: { padding: spacing.lg, gap: spacing.md },
  inputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(6,11,24,0.6)',
    borderRadius: radii.pill,
    paddingLeft: spacing.md,
    paddingRight: 6,
    height: 56,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  pasteButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(6,11,24,0.5)',
  },
  chipActive: { backgroundColor: 'rgba(56,189,248,0.16)' },
  chipLabel: { ...typography.caption, color: colors.textMuted },
  chipLabelActive: { color: colors.cyan, fontFamily: 'SpaceGrotesk_500Medium' },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.sm },
  qualityChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(6,11,24,0.5)',
  },
  qualityLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger },
  sectionTitle: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionAction: { ...typography.caption, color: colors.cyan },
  jobList: { gap: spacing.sm },
  jobPanel: { borderRadius: radii.lg },
  jobTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  jobAction: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(6,11,24,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  jobPct: { ...typography.caption, fontSize: 11, color: colors.cyan, fontFamily: 'SpaceGrotesk_600SemiBold' },
  jobBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobBadgeFailed: { backgroundColor: 'rgba(248,113,113,0.12)' },
  jobText: { flex: 1, gap: 4 },
  jobTitle: { ...typography.subtitle, color: colors.textPrimary, flex: 1 },
  jobStageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobStage: { ...typography.caption, color: colors.textMuted },
  jobError: { color: colors.danger },
  shelfContent: { gap: spacing.md, paddingVertical: spacing.xs },
  coverCard: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  coverScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
  },
  coverGlyphWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverMeta: { padding: spacing.sm + 2 },
  coverTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textPrimary },
  coverArtist: { ...typography.caption, fontSize: 11, color: colors.textMuted },
});
