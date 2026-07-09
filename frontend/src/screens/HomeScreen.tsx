import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { useResponsive } from '../hooks/useResponsive';
import { DashboardCustomizer } from '../components/dashboard/DashboardCustomizer';
import {
  ContinueListeningWidget,
  FavoritesWidget,
  OfflineWidget,
  OnRepeatWidget,
  PinnedWidget,
  QueueWidget,
  QuickActionsWidget,
  RecentDownloadsWidget,
  StatsWidget,
  TelegramWidget,
} from '../components/dashboard/widgets';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Reveal } from '../components/ui/Reveal';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job, Media } from '../services/api/types';
import { useDashboardStore } from '../store/dashboardStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { toast } from '../store/toastStore';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';
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
  const { isDesktop } = useResponsive();
  const coverSize = isDesktop ? 188 : COVER_SIZE;
  const [url, setUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<MediaKind>('audio');
  const [audioFormat, setAudioFormat] = useState<downloadsApi.AudioFormat>('mp3-192');
  const [videoQuality, setVideoQuality] = useState<downloadsApi.VideoQuality>('1080p');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const unsubscribers = useRef<Map<string, () => void>>(new Map());
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const libraryItems = useLibraryStore((s) => s.items);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const playQueue = usePlayerStore((s) => s.playQueue);

  const widgetOrder = useDashboardStore((s) => s.order);
  const density = useDashboardStore((s) => s.density);
  const accentStyle = useDashboardStore((s) => s.accentStyle);
  const accentColor = accentStyle === 'cosmic' ? colors.violet : colors.cyan;

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

  const recents = libraryItems.slice(0, RECENTS_LIMIT);

  async function handlePlayRecent(media: Media) {
    if (media.media_type === 'video') {
      useVideoPlayerStore.getState().openExpanded(media.id);
      return;
    }
    // Queue the whole shelf so next/prev keeps flowing from this tap.
    const audioRecents = recents.filter((m) => m.media_type !== 'video');
    const index = audioRecents.findIndex((m) => m.id === media.id);
    await playQueue(audioRecents, Math.max(0, index));
    navigation.navigate('Player');
  }

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={1020}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Reveal>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>DUSKGLEN</Text>
                <GradientText style={styles.megaTitle}>{greeting()}</GradientText>
                <Text style={styles.tagline}>Bring something in — paste any link.</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={() => setCustomizerOpen(true)} hitSlop={8} style={styles.customizeButton}>
                  <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
                </Pressable>
                <SidebarTrigger />
              </View>
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
                      <ActivityIndicator size="small" color="#0A0F0D" />
                    ) : (
                      <Ionicons name="arrow-forward" size={20} color="#0A0F0D" />
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

          <Reveal delay={120}>
            <View>
              {widgetOrder
                .filter((w) => w.visible)
                .map((w) => {
                  switch (w.id) {
                    case 'continueListening':
                      return <ContinueListeningWidget key={w.id} density={density} accentColor={accentColor} />;
                    case 'pinned':
                      return <PinnedWidget key={w.id} density={density} coverSize={coverSize} onPlay={handlePlayRecent} />;
                    case 'onRepeat':
                      return <OnRepeatWidget key={w.id} density={density} coverSize={coverSize} onPlay={handlePlayRecent} />;
                    case 'queue':
                      return (
                        <QueueWidget
                          key={w.id}
                          density={density}
                          jobs={jobs}
                          onCancel={handleCancelJob}
                          onRetry={handleRetryJob}
                          onClearFinished={clearFinishedJobs}
                        />
                      );
                    case 'recent':
                      return (
                        <RecentDownloadsWidget
                          key={w.id}
                          density={density}
                          items={recents}
                          coverSize={coverSize}
                          onPlay={handlePlayRecent}
                        />
                      );
                    case 'favorites':
                      return <FavoritesWidget key={w.id} density={density} coverSize={coverSize} onPlay={handlePlayRecent} />;
                    case 'stats':
                      return <StatsWidget key={w.id} density={density} accentColor={accentColor} />;
                    case 'telegram':
                      return <TelegramWidget key={w.id} density={density} />;
                    case 'offline':
                      return <OfflineWidget key={w.id} density={density} />;
                    case 'quickActions':
                      return <QuickActionsWidget key={w.id} density={density} accentColor={accentColor} />;
                    default:
                      return null;
                  }
                })}
            </View>
          </Reveal>
        </ScrollView>
      </ScreenContainer>
      <MiniPlayerBar />
      <DashboardCustomizer visible={customizerOpen} onClose={() => setCustomizerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050805' },
  scroll: { paddingBottom: layout.tabBarClearance },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customizeButton: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.12)',
  },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  megaTitle: { ...typography.mega },
  tagline: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  heroPanel: { marginBottom: spacing.lg },
  heroContent: { padding: spacing.lg, gap: spacing.md },
  inputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(5,8,5,0.6)',
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
    backgroundColor: 'rgba(5,8,5,0.5)',
  },
  chipActive: { backgroundColor: 'rgba(47,191,170,0.16)' },
  chipLabel: { ...typography.caption, color: colors.textMuted },
  chipLabelActive: { color: colors.cyan, fontFamily: 'SpaceGrotesk_500Medium' },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -spacing.sm },
  qualityChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(5,8,5,0.5)',
  },
  qualityLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger },
});
