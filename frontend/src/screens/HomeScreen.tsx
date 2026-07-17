import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { DashboardCustomizer } from '../components/dashboard/DashboardCustomizer';
import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Reveal } from '../components/ui/Reveal';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import { useBottomChromeClearance } from '../hooks/useBottomChromeClearance';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useResponsive } from '../hooks/useResponsive';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job, Media } from '../services/api/types';
import { isSupported as offlineSupported, listOffline, type OfflineEntry } from '../services/storage/offlineMedia';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore, type WidgetId } from '../store/dashboardStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePinStore } from '../store/pinStore';
import { usePlayerStore } from '../store/playerStore';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { toast } from '../store/toastStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { colors, glass, glassBlur, radii, spacing, typography } from '../theme/tokens';
import { apiErrorMessage, friendlyJobStage } from '../utils/apiError';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';

type MediaKind = 'audio' | 'video';
type SubmittedLink = { url: string; jobId: string };

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

const AUDIO_FORMATS: { key: downloadsApi.AudioFormat; label: string }[] = [
  { key: 'mp3-192', label: 'MP3 · 192' },
  { key: 'mp3-320', label: 'MP3 · 320' },
  { key: 'm4a', label: 'M4A' },
  { key: 'source', label: 'Original' },
];

const VIDEO_QUALITIES: { key: downloadsApi.VideoQuality; label: string }[] = [
  { key: '1080p', label: '1080p' },
  { key: '720p', label: '720p' },
  { key: '2160p', label: '4K' },
  { key: 'source', label: 'Original' },
];

const MEDIA_KINDS = [
  { value: 'audio', label: 'Audio', icon: 'musical-notes' },
  { value: 'video', label: 'Video', icon: 'videocam' },
] as const;

function dayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Accept shared prose as well as newline/space-separated raw URLs. */
function extractMediaLinks(input: string): string[] {
  const matches = input.match(HTTP_URL_PATTERN) ?? [];
  const normalized = matches
    .map((match) => match.replace(/[),.;!?\]}]+$/g, ''))
    .filter((candidate) => {
      try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });
  return [...new Set(normalized)];
}

function sharedLinksFromIncomingUrl(incoming: string): string[] {
  try {
    const parsed = new URL(incoming);
    const nativeShare = parsed.protocol === 'starhollow:' && (parsed.hostname === 'share' || parsed.pathname === '/share');
    const pwaShare = parsed.searchParams.get('share') === '1';
    if (!nativeShare && !pwaShare) return [];

    return extractMediaLinks(
      [
        ...parsed.searchParams.getAll('url'),
        ...parsed.searchParams.getAll('urls'),
        ...parsed.searchParams.getAll('text'),
      ].join('\n'),
    );
  } catch {
    return [];
  }
}

function hasPlaylistShape(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has('list') || /\b(?:playlist|sets?)\b/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function compactLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return url;
  }
}

function ActiveJobRow({ job, accent, onCancel }: { job: Job; accent: string; onCancel: () => void }) {
  const label = job.result_media ? displayTitle(job.result_media) : job.match_title ?? 'Adding to your library';
  const stage = friendlyJobStage(job.stage_label, job.status === 'pending' ? 'Waiting to start' : 'Preparing media');
  const progress = Math.max(0, Math.min(100, job.progress_pct));

  return (
    <View style={styles.activeJobRow} accessibilityLabel={`${label}, ${stage}, ${Math.round(progress)} percent`}>
      <View style={styles.jobIcon}>
        <Ionicons name={job.job_type === 'recognize' ? 'sparkles' : 'arrow-down'} size={17} color={accent} />
      </View>
      <View style={styles.jobBody}>
        <View style={styles.jobTitleRow}>
          <Text numberOfLines={1} style={styles.jobTitle}>{label}</Text>
          <Text style={[styles.jobPercent, { color: accent }]}>{Math.round(progress)}%</Text>
        </View>
        <Text numberOfLines={1} style={styles.jobStage}>{stage}</Text>
        <ProgressBar progress={progress / 100} />
      </View>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={`Cancel ${label}`}
        hitSlop={4}
        style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function SubmittedLinkRow({
  url,
  job,
  accent,
  onCancel,
}: {
  url: string;
  job: Job;
  accent: string;
  onCancel: () => void;
}) {
  const active = job.status === 'pending' || job.status === 'in_progress';
  const complete = job.status === 'complete';
  const failed = job.status === 'failed' || job.status === 'cancelled';
  const progress = complete ? 100 : Math.max(0, Math.min(100, job.progress_pct));
  const status = failed
    ? job.error_message ?? (job.status === 'cancelled' ? 'Cancelled' : 'This link could not be imported')
    : friendlyJobStage(job.stage_label, job.status === 'pending' ? 'Waiting to start' : complete ? 'Added to library' : 'Preparing media');
  const statusColor = failed ? colors.danger : complete ? colors.success : accent;

  return (
    <View
      style={styles.batchLinkRow}
      accessibilityLabel={`${compactLinkLabel(url)}, ${status}, ${Math.round(progress)} percent`}
    >
      <View style={[styles.batchStatusIcon, { borderColor: `${statusColor}45` }]}>
        <Ionicons
          name={failed ? 'alert' : complete ? 'checkmark' : 'arrow-down'}
          size={14}
          color={statusColor}
        />
      </View>
      <View style={styles.batchLinkBody}>
        <View style={styles.batchLinkHeading}>
          <Text numberOfLines={1} style={styles.batchLinkTitle}>{compactLinkLabel(url)}</Text>
          <Text style={[styles.batchLinkPercent, { color: statusColor }]}>{Math.round(progress)}%</Text>
        </View>
        <Text numberOfLines={2} style={[styles.batchLinkStage, failed && styles.batchLinkStageFailed]}>{status}</Text>
        <ProgressBar progress={progress / 100} />
      </View>
      {active ? (
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={`Cancel ${compactLinkLabel(url)}`}
          hitSlop={4}
          style={({ pressed }) => [styles.batchCancelButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={17} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MediaCard({ media, size, onPress }: { media: Media; size: number; onPress: () => void }) {
  const artist = displayArtist(media);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${displayTitle(media)}${artist ? ` by ${artist}` : ''}`}
      style={({ pressed }) => [styles.recentCard, { width: size }, pressed && styles.cardPressed]}
    >
      <Artwork media={media} size={size} style={styles.artwork} />
      <Text numberOfLines={1} style={styles.recentTitle}>{displayTitle(media)}</Text>
      <Text numberOfLines={1} style={styles.recentArtist}>{artist ?? (media.media_type === 'video' ? 'Video' : 'Unknown artist')}</Text>
    </Pressable>
  );
}

function StatTile({ icon, value, label, accent }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; accent: string }) {
  return (
    <View style={[styles.statTile, glassBlur]} accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { width, isDesktop } = useResponsive();
  const bottomChromeClearance = useBottomChromeClearance();
  const user = useAuthStore((state) => state.user);
  const libraryItems = useLibraryStore((state) => state.items);
  const libraryHydrated = useLibraryStore((state) => state.hydrated);
  const libraryLoading = useLibraryStore((state) => state.isLoading);
  const refreshLibrary = useLibraryStore((state) => state.refresh);
  const upsertMedia = useLibraryStore((state) => state.upsert);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.toggle);
  const pinnedIds = usePinStore((state) => state.ids);
  const playEvents = usePlayHistoryStore((state) => state.events);
  const minutes30 = usePlayHistoryStore((state) => state.totalMinutesInWindow);
  const { backendOnline, networkOnline } = useOnlineStatus();

  const dashboardOrder = useDashboardStore((s) => s.order);
  const dashboardHidden = useDashboardStore((s) => s.hidden);
  const density = useDashboardStore((s) => s.density);
  const accentStyle = useDashboardStore((s) => s.accent);
  const hydrateDashboard = useDashboardStore((s) => s.hydrate);

  const [url, setUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<MediaKind>('audio');
  const [audioFormat, setAudioFormat] = useState<downloadsApi.AudioFormat>('mp3-192');
  const [videoQuality, setVideoQuality] = useState<downloadsApi.VideoQuality>('1080p');
  const [downloadPlaylist, setDownloadPlaylist] = useState(false);
  const [playlistInspection, setPlaylistInspection] = useState<downloadsApi.DownloadInspection | null>(null);
  const [inspectingPlaylist, setInspectingPlaylist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submittedLinks, setSubmittedLinks] = useState<SubmittedLink[]>([]);
  const [customizing, setCustomizing] = useState(false);
  const [offlineEntries, setOfflineEntries] = useState<OfflineEntry[]>([]);

  const accent = accentStyle === 'cosmic' ? colors.violet : colors.cyan;
  const compact = density === 'compact';
  const smallPhone = !isDesktop && width < 390;
  const parsedUrls = useMemo(() => extractMediaLinks(url), [url]);
  const singleUrl = parsedUrls.length === 1 ? parsedUrls[0] : null;
  const playlistHint = parsedUrls.some(hasPlaylistShape);
  const playlistDetected = playlistInspection?.is_playlist === true || (!playlistInspection && playlistHint);

  const firstName = user?.display_name?.trim().split(/\s+/)[0];
  const recentItems = useMemo(
    () => [...libraryItems].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
    [libraryItems],
  );
  const pinnedItems = useMemo(
    () => pinnedIds.map((id) => libraryItems.find((item) => item.id === id)).filter((item): item is Media => !!item),
    [pinnedIds, libraryItems],
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'pending' || job.status === 'in_progress'),
    [jobs],
  );
  const activeJobIds = activeJobs.map((job) => job.id).join('|');
  const submittedJobs = useMemo(
    () => submittedLinks
      .map((submitted) => {
        const job = jobs.find((item) => item.id === submitted.jobId);
        return job ? { ...submitted, job } : null;
      })
      .filter((item): item is SubmittedLink & { job: Job } => !!item),
    [jobs, submittedLinks],
  );
  const stats = useMemo(() => {
    const tracks = libraryItems.filter((item) => item.media_type === 'audio').length;
    const videos = libraryItems.filter((item) => item.media_type === 'video').length;
    return { tracks, videos, minutes: minutes30(30), plays: playEvents.length };
  }, [libraryItems, minutes30, playEvents]);

  const updateJob = useCallback((job: Job) => {
    setJobs((current) => {
      const exists = current.some((item) => item.id === job.id);
      const next = exists ? current.map((item) => (item.id === job.id ? job : item)) : [job, ...current];
      return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
    if (job.status === 'complete' && job.result_media) upsertMedia(job.result_media);
  }, [upsertMedia]);

  useEffect(() => {
    void hydrateDashboard();
    void refreshLibrary();
  }, [hydrateDashboard, refreshLibrary]);

  useEffect(() => {
    const acceptSharedUrl = (incoming: string) => {
      const incomingLinks = sharedLinksFromIncomingUrl(incoming);
      if (incomingLinks.length === 0) return;
      setUrl((current) => [...new Set([...extractMediaLinks(current), ...incomingLinks])].join('\n'));
      setError(null);
    };

    void Linking.getInitialURL().then((incoming) => {
      if (incoming) acceptSharedUrl(incoming);
    });
    const subscription = Linking.addEventListener('url', ({ url: incoming }) => acceptSharedUrl(incoming));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setPlaylistInspection(null);
    setInspectingPlaylist(false);
    setDownloadPlaylist(false);
    if (!singleUrl) return undefined;

    let active = true;
    const timer = setTimeout(() => {
      setInspectingPlaylist(true);
      void downloadsApi
        .inspectDownload(singleUrl)
        .then((inspection) => {
          if (!active) return;
          setPlaylistInspection(inspection);
          if (!inspection.is_playlist) setDownloadPlaylist(false);
        })
        .catch(() => {
          // A playlist-looking URL can still expose the opt-in while offline;
          // the create endpoint remains the final source of truth.
        })
        .finally(() => {
          if (active) setInspectingPlaylist(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [singleUrl]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void downloadsApi
        .listDownloads()
        .then((items) => {
          if (active) setJobs([...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
        })
        .catch(() => {
          // Today remains useful offline; Activity owns the explicit retry state.
        });
      if (offlineSupported()) {
        void listOffline()
          .then((entries) => {
            if (active) setOfflineEntries(entries);
          })
          .catch(() => {});
      }
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!isFocused || !activeJobIds) return undefined;
    const unsubscribers = activeJobs.map((job) => watchJob(job.id, updateJob));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // The stable id signature changes only when a job enters or leaves the active set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobIds, isFocused, updateJob]);

  function openTab(screen: keyof MainTabParamList) {
    navigation.navigate('Main', { screen });
  }

  async function handleSubmit() {
    if (submitting) return;
    if (parsedUrls.length === 0) {
      setError('Paste at least one complete http:// or https:// media link.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await downloadsApi.createDownloads(parsedUrls, mediaKind, {
        audioFormat,
        videoQuality,
        downloadPlaylist,
      });
      created.forEach(updateJob);
      setSubmittedLinks(
        created.map((job, index) => ({ url: job.source_url ?? parsedUrls[index] ?? parsedUrls[0], jobId: job.id })),
      );
      setUrl('');
      setDownloadPlaylist(false);
      toast(
        created.length === 1 ? 'Import started.' : `${created.length} links queued. Each will keep its own progress.`,
        'success',
      );
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn't start these imports."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaste() {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) {
        toast('Your clipboard is empty.', 'info');
        return;
      }
      setUrl(text);
      setError(null);
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't read your clipboard."), 'error');
    }
  }

  async function handleCancel(job: Job) {
    try {
      updateJob(await downloadsApi.cancelDownload(job.id));
      toast('Import cancelled.', 'info');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't cancel this import."), 'error');
    }
  }

  async function playFrom(list: Media[], media: Media) {
    if (media.media_type === 'video') {
      useVideoPlayerStore.getState().openExpanded(media.id);
      return;
    }
    const audioItems = list.filter((item) => item.media_type === 'audio');
    const index = audioItems.findIndex((item) => item.id === media.id);
    try {
      await playQueue(audioItems, Math.max(0, index));
      navigation.navigate('Player');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't play this track."), 'error');
    }
  }

  const choices = mediaKind === 'audio' ? AUDIO_FORMATS : VIDEO_QUALITIES;
  const cardSize = compact ? 108 : isDesktop ? 164 : 132;
  const sectionGap = compact ? spacing.lg : spacing.xl;
  const panelPadding = compact ? spacing.md : spacing.lg;
  const visibleWidgets = dashboardOrder.filter((id) => !dashboardHidden.includes(id));
  const showFirstUse =
    libraryHydrated && !libraryLoading && recentItems.length === 0 && activeJobs.length === 0 && !currentMedia;
  const offline = !networkOnline || backendOnline === false;
  const offlineBytes = offlineEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const offlineShelfEmpty = offlineSupported() && offlineEntries.length === 0 && !offline;
  const submittedComplete = submittedJobs.filter(({ job }) => job.status === 'complete').length;
  const submittedFinished = submittedJobs.filter(
    ({ job }) => job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled',
  ).length;

  const widgetRenderers: Record<WidgetId, () => ReactElement | null> = {
    import: () => (
      <GlassPanel style={styles.importPanel} edgeColor={accentStyle === 'cosmic' ? 'rgba(169,155,219,0.24)' : 'rgba(99,214,181,0.24)'}>
        <View style={[styles.importContent, { padding: smallPhone ? spacing.md : panelPadding }]}>
          <View style={styles.importHeading}>
            <View style={styles.importIcon}>
              <Ionicons name="link" size={18} color={accent} />
            </View>
            <View style={styles.importHeadingCopy}>
              <Text style={[styles.importEyebrow, { color: accent }]}>IMPORT LINKS</Text>
              <Text style={[styles.importTitle, smallPhone && styles.importTitleSmall]}>Bring a track home.</Text>
            </View>
          </View>

          <View style={[styles.inputRow, styles.inputRowMultiline, glassBlur]}>
            <TextInput
              value={url}
              onChangeText={(value) => {
                setUrl(value);
                if (error) setError(null);
              }}
              accessibilityLabel="Media link"
              accessibilityHint="Paste one or more links separated by spaces or new lines"
              placeholder="Paste links — one per line or space-separated"
              placeholderTextColor={colors.textMuted}
              selectionColor={accent}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
              style={styles.input}
            />
            <Pressable
              onPress={() => void handlePaste()}
              accessibilityRole="button"
              accessibilityLabel="Paste link"
              style={({ pressed }) => [
                styles.pasteButton,
                smallPhone && styles.pasteButtonSmall,
                glassBlur,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="clipboard-outline" size={16} color={colors.textSecondary} />
              {!smallPhone ? <Text style={styles.pasteLabel}>Paste</Text> : null}
            </Pressable>
          </View>

          {playlistDetected ? (
            <View style={styles.playlistToggleRow}>
              <View style={styles.playlistToggleCopy}>
                <View style={styles.playlistToggleHeading}>
                  <Ionicons name="list" size={16} color={accent} />
                  <Text style={styles.playlistToggleTitle}>Download full playlist</Text>
                </View>
                <Text numberOfLines={2} style={styles.playlistToggleHint}>
                  {playlistInspection?.playlist_title
                    ? `${playlistInspection.playlist_title}${playlistInspection.entry_count ? ` · ${playlistInspection.entry_count} entries` : ''}`
                    : inspectingPlaylist
                      ? 'Playlist detected · checking its details…'
                      : parsedUrls.length > 1
                        ? 'Off keeps only the shared tracks; on expands playlist links in this batch.'
                        : 'Off keeps only the shared track.'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Download full playlist"
                accessibilityHint="Off downloads only the shared track. On downloads every playlist entry."
                value={downloadPlaylist}
                onValueChange={setDownloadPlaylist}
                trackColor={{ false: colors.surfaceBorderStrong, true: accent }}
                thumbColor={downloadPlaylist ? colors.textInverse : colors.textSecondary}
              />
            </View>
          ) : null}

          <SegmentedControl
            options={MEDIA_KINDS}
            value={mediaKind}
            onChange={setMediaKind}
            accessibilityLabel="Import type"
          />

          <View>
            <Text style={styles.formatLabel}>QUALITY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formatRow}>
              {choices.map((choice) => {
                const selected = mediaKind === 'audio' ? audioFormat === choice.key : videoQuality === choice.key;
                return (
                  <Pressable
                    key={choice.key}
                    onPress={() => {
                      if (mediaKind === 'audio') setAudioFormat(choice.key as downloadsApi.AudioFormat);
                      else setVideoQuality(choice.key as downloadsApi.VideoQuality);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={`${choice.label} quality`}
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => [styles.formatChip, glassBlur, selected && styles.formatChipSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.formatChipLabel, selected && styles.formatChipLabelSelected]}>{choice.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {error ? (
            <View style={styles.errorRow} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            label={parsedUrls.length > 1 ? `Add ${parsedUrls.length} links to library` : 'Add to library'}
            onPress={() => void handleSubmit()}
            disabled={parsedUrls.length === 0}
            loading={submitting}
            style={styles.importButton}
          />
          <Text style={styles.helperText}>
            {parsedUrls.length > 0
              ? `${parsedUrls.length} ${parsedUrls.length === 1 ? 'link' : 'links'} · ${mediaKind === 'audio' ? 'Audio' : 'Video'} · ${mediaKind === 'audio' ? AUDIO_FORMATS.find((item) => item.key === audioFormat)?.label : VIDEO_QUALITIES.find((item) => item.key === videoQuality)?.label}`
              : url.trim()
                ? 'No complete http:// or https:// link found yet.'
                : 'Paste a link to continue.'}
          </Text>

          {submittedJobs.length > 0 ? (
            <View style={styles.batchProgressBlock} accessibilityLiveRegion="polite">
              <View style={styles.batchProgressHeading}>
                <Text style={styles.batchProgressEyebrow}>LATEST IMPORT</Text>
                <Text style={styles.batchProgressSummary}>
                  {submittedFinished === submittedJobs.length
                    ? `${submittedComplete}/${submittedJobs.length} added`
                    : `${submittedFinished}/${submittedJobs.length} finished`}
                </Text>
              </View>
              {submittedJobs.map(({ url: submittedUrl, job }, index) => (
                <View key={job.id}>
                  {index > 0 ? <View style={styles.batchDivider} /> : null}
                  <SubmittedLinkRow
                    url={submittedUrl}
                    job={job}
                    accent={accent}
                    onCancel={() => void handleCancel(job)}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </GlassPanel>
    ),

    inProgress: () =>
      activeJobs.length === 0 ? null : (
        <View style={{ marginTop: sectionGap }}>
          <SectionHeader title="In progress" actionLabel="See all" onAction={() => openTab('Activity')} style={styles.sectionHeader} />
          <GlassPanel style={styles.activityPanel}>
            {activeJobs.slice(0, 2).map((job, index) => (
              <View key={job.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ActiveJobRow job={job} accent={accent} onCancel={() => void handleCancel(job)} />
              </View>
            ))}
          </GlassPanel>
        </View>
      ),

    continue: () =>
      !currentMedia || playing ? null : (
        <View style={{ marginTop: sectionGap }}>
          <SectionHeader title="Continue listening" style={styles.sectionHeader} />
          <GlassPanel style={styles.continuePanel}>
            <View style={styles.continueContent}>
              <Artwork media={currentMedia} size={compact ? 52 : 64} priority />
              <Pressable
                onPress={() => navigation.navigate('Player')}
                accessibilityRole="button"
                accessibilityLabel={`Open player for ${displayTitle(currentMedia)}`}
                style={({ pressed }) => [styles.continueCopy, pressed && styles.pressed]}
              >
                <Text style={[styles.continueEyebrow, { color: accent }]}>READY WHEN YOU ARE</Text>
                <Text numberOfLines={1} style={styles.continueTitle}>{displayTitle(currentMedia)}</Text>
                <Text numberOfLines={1} style={styles.continueArtist}>{displayArtist(currentMedia) ?? 'Unknown artist'}</Text>
              </Pressable>
              <Pressable
                onPress={togglePlayback}
                accessibilityRole="button"
                accessibilityLabel={`Resume ${displayTitle(currentMedia)}`}
                style={({ pressed }) => [
                  styles.resumeButton,
                  glassBlur,
                  { backgroundColor: `${accent}2E`, borderColor: `${accent}66` },
                  pressed && styles.cardPressed,
                ]}
              >
                <Ionicons name="play" size={21} color={accent} style={{ marginLeft: 2 }} />
              </Pressable>
            </View>
          </GlassPanel>
        </View>
      ),

    recent: () =>
      recentItems.length === 0 ? null : (
        <View style={{ marginTop: sectionGap }}>
          <SectionHeader title="Recently added" actionLabel="Library" onAction={() => openTab('Library')} style={styles.sectionHeader} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
            snapToInterval={cardSize + spacing.md}
            decelerationRate="fast"
          >
            {recentItems.map((media) => (
              <MediaCard key={media.id} media={media} size={cardSize} onPress={() => void playFrom(recentItems, media)} />
            ))}
          </ScrollView>
        </View>
      ),

    pinned: () =>
      pinnedItems.length === 0 ? null : (
        <View style={{ marginTop: sectionGap }}>
          <SectionHeader title="Pinned" style={styles.sectionHeader} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
            snapToInterval={cardSize + spacing.md}
            decelerationRate="fast"
          >
            {pinnedItems.map((media) => (
              <MediaCard key={media.id} media={media} size={cardSize} onPress={() => void playFrom(pinnedItems, media)} />
            ))}
          </ScrollView>
        </View>
      ),

    offline: () => (
      <View style={{ marginTop: sectionGap }}>
        <SectionHeader title="Offline shelf" style={styles.sectionHeader} />
        <GlassPanel style={[styles.offlinePanel, offlineShelfEmpty && styles.offlinePanelEmpty]}>
          {offlineShelfEmpty ? (
            <EmptyState
              compact
              icon="cloud-download-outline"
              title="Nothing saved yet"
              subtitle={'Use "Save offline" on any track to keep it available on this device.'}
              actionLabel="Offline settings"
              onAction={() => navigation.navigate('Settings')}
            />
          ) : (
            <View
              style={styles.offlineRow}
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={offline ? 'Offline. Playing from this device.' : 'Online. Connected to your hollow.'}
            >
              <View style={[styles.offlineDot, { backgroundColor: offline ? colors.warning : colors.success }]} />
              <View style={styles.offlineCopy}>
                <Text style={styles.offlineTitle}>
                  {offline ? 'Offline — playing from this device' : 'Connected to your hollow'}
                </Text>
                <Text style={styles.offlineDetail}>
                  {offlineSupported()
                    ? offlineEntries.length > 0
                      ? `${offlineEntries.length} ${offlineEntries.length === 1 ? 'track' : 'tracks'} saved · ${formatBytes(offlineBytes)}`
                      : 'Nothing saved yet — use "Save offline" on any track'
                    : 'Offline saving works in the web app and installed PWA'}
                </Text>
              </View>
              <IconButton
                icon="settings-outline"
                accessibilityLabel="Open offline settings"
                size={38}
                iconSize={17}
                onPress={() => navigation.navigate('Settings')}
              />
            </View>
          )}
        </GlassPanel>
      </View>
    ),

    stats: () => (
      <View style={{ marginTop: sectionGap }}>
        <SectionHeader title="Your listening" style={styles.sectionHeader} />
        <View style={styles.statsRow}>
          <StatTile icon="musical-notes-outline" value={String(stats.tracks)} label="Tracks" accent={accent} />
          <StatTile icon="videocam-outline" value={String(stats.videos)} label="Videos" accent={accent} />
          <StatTile icon="time-outline" value={`${stats.minutes}m`} label="Last 30 days" accent={accent} />
          <StatTile icon="play-outline" value={String(stats.plays)} label="Total plays" accent={accent} />
        </View>
      </View>
    ),

    quickActions: () => (
      <View style={{ marginTop: sectionGap }}>
        <SectionHeader title="Quick actions" style={styles.sectionHeader} />
        <View style={styles.quickRow}>
          {(
            [
              { icon: 'mic-outline', label: 'Identify', go: () => openTab('Recognize') },
              { icon: 'paper-plane-outline', label: 'Telegram', go: () => navigation.navigate('Telegram') },
              { icon: 'sparkles-outline', label: 'Replay', go: () => navigation.navigate('Replay') },
              { icon: 'pulse-outline', label: 'Activity', go: () => openTab('Activity') },
            ] as const
          ).map((action) => (
            <Pressable
              key={action.label}
              onPress={action.go}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [styles.quickTile, glassBlur, pressed && styles.cardPressed]}
            >
              <Ionicons name={action.icon} size={19} color={accent} />
              <Text style={styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ),
  };

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={1040}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottomChromeClearance }}
        >
          <Reveal>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: accent }]}>TODAY</Text>
                <Text style={styles.title}>{dayGreeting()}{firstName ? `, ${firstName}` : ''}.</Text>
                <Text style={styles.subtitle}>Keep what you find. Play it your way.</Text>
              </View>
              <View style={styles.headerActions}>
                <IconButton
                  icon="options-outline"
                  accessibilityLabel="Customize dashboard"
                  variant="surface"
                  size={40}
                  iconSize={18}
                  onPress={() => setCustomizing(true)}
                />
                <SidebarTrigger size={40} />
              </View>
            </View>
          </Reveal>

          {visibleWidgets.map((id, index) => {
            const rendered = widgetRenderers[id]();
            if (!rendered) return null;
            return (
              <Reveal key={id} delay={Math.min(160, 60 + index * 30)}>
                {rendered}
              </Reveal>
            );
          })}

          {showFirstUse ? (
            <Reveal delay={120} style={{ marginTop: sectionGap }}>
              <SectionHeader title="Start here" style={styles.sectionHeader} />
              <View style={styles.firstUseRow}>
                <Pressable
                  onPress={() => openTab('Recognize')}
                  accessibilityRole="button"
                  accessibilityLabel="Identify music playing nearby"
                  style={({ pressed }) => [styles.firstUseCard, glassBlur, pressed && styles.cardPressed]}
                >
                  <View style={styles.firstUseIcon}><Ionicons name="mic" size={21} color={accent} /></View>
                  <Text style={styles.firstUseTitle}>Identify music</Text>
                  <Text style={styles.firstUseBody}>Hear something? Name it in seconds.</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('Telegram')}
                  accessibilityRole="button"
                  accessibilityLabel="Import from Telegram"
                  style={({ pressed }) => [styles.firstUseCard, glassBlur, pressed && styles.cardPressed]}
                >
                  <View style={styles.firstUseIcon}><Ionicons name="paper-plane" size={21} color={colors.violet} /></View>
                  <Text style={styles.firstUseTitle}>Telegram</Text>
                  <Text style={styles.firstUseBody}>Bring saved audio into your library.</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            </Reveal>
          ) : null}

          {libraryLoading && recentItems.length === 0 ? (
            <View style={styles.libraryLoading} accessibilityLabel="Loading your library">
              <ActivityIndicator color={accent} />
              <Text style={styles.libraryLoadingText}>Loading your library…</Text>
            </View>
          ) : null}
        </ScrollView>
      </ScreenContainer>
      <MiniPlayerBar />
      <DashboardCustomizer visible={customizing} onClose={() => setCustomizing(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrow: { ...typography.eyebrow, marginBottom: spacing.xs },
  title: { ...typography.mega, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  importPanel: { marginBottom: spacing.sm },
  importContent: { gap: spacing.md },
  importHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  importIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,214,181,0.12)',
  },
  importHeadingCopy: { flex: 1 },
  importEyebrow: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 2 },
  importTitle: { ...typography.title, fontSize: 22, lineHeight: 28, color: colors.textPrimary },
  importTitleSmall: { fontSize: 19, lineHeight: 25 },
  inputRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: 5,
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  inputRowMultiline: { alignItems: 'flex-start', paddingVertical: 5 },
  input: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    maxHeight: 112,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  pasteButton: {
    minWidth: 72,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radii.md - 3,
    backgroundColor: glass.fillBright,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  pasteButtonSmall: { minWidth: 44, width: 44, paddingHorizontal: 0 },
  pasteLabel: { ...typography.caption, fontFamily: 'Sora_500Medium', color: colors.textSecondary },
  playlistToggleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  playlistToggleCopy: { flex: 1, minWidth: 0, gap: 3 },
  playlistToggleHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  playlistToggleTitle: { ...typography.subtitle, flex: 1, fontSize: 13, color: colors.textPrimary },
  playlistToggleHint: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  formatLabel: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 1.8, color: colors.textMuted, marginBottom: spacing.sm },
  formatRow: { gap: spacing.sm, paddingRight: spacing.sm },
  formatChip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  formatChipSelected: { backgroundColor: 'rgba(169,155,219,0.11)', borderColor: 'rgba(169,155,219,0.22)' },
  formatChipLabel: { ...typography.caption, color: colors.textMuted },
  formatChipLabelSelected: { color: colors.textSecondary, fontFamily: 'Sora_500Medium' },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: 'rgba(240,131,140,0.09)',
  },
  errorText: { ...typography.caption, flex: 1, color: colors.danger },
  importButton: { width: '100%' },
  helperText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: -spacing.sm },
  batchProgressBlock: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
  },
  batchProgressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  batchProgressEyebrow: { ...typography.eyebrow, fontSize: 9, letterSpacing: 1.6, color: colors.textMuted },
  batchProgressSummary: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  batchLinkRow: { minHeight: 74, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  batchStatusIcon: {
    width: 30,
    height: 30,
    marginTop: 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: glass.fillDeep,
  },
  batchLinkBody: { flex: 1, minWidth: 0, gap: 4 },
  batchLinkHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  batchLinkTitle: { ...typography.caption, flex: 1, fontFamily: 'Sora_500Medium', color: colors.textPrimary },
  batchLinkPercent: { ...typography.caption, fontFamily: 'Sora_600SemiBold', fontSize: 10 },
  batchLinkStage: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  batchLinkStageFailed: { color: colors.danger },
  batchCancelButton: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  batchDivider: { height: 1, backgroundColor: glass.stroke },
  sectionHeader: { marginBottom: spacing.sm },
  activityPanel: { paddingHorizontal: spacing.md },
  activeJobRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  jobIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,214,181,0.11)',
  },
  jobBody: { flex: 1, gap: 5 },
  jobTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobTitle: { ...typography.subtitle, flex: 1, fontSize: 14, color: colors.textPrimary },
  jobPercent: { ...typography.caption, fontFamily: 'Sora_600SemiBold', fontSize: 11 },
  jobStage: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  cancelButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: glass.stroke },
  continuePanel: { padding: spacing.md },
  continueContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  continueCopy: { flex: 1, minHeight: 48, justifyContent: 'center' },
  continueEyebrow: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.7 },
  continueTitle: { ...typography.subtitle, color: colors.textPrimary },
  continueArtist: { ...typography.caption, color: colors.textMuted },
  resumeButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  recentRow: { gap: spacing.md, paddingRight: spacing.lg, paddingBottom: spacing.sm },
  recentCard: { gap: 4 },
  artwork: { marginBottom: spacing.xs },
  recentTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  recentArtist: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  offlinePanel: { padding: spacing.md },
  offlinePanelEmpty: { padding: 0 },
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offlineDot: { width: 9, height: 9, borderRadius: radii.pill },
  offlineCopy: { flex: 1 },
  offlineTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  offlineDetail: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statTile: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 132,
    minHeight: 86,
    padding: spacing.md,
    gap: 3,
    borderRadius: radii.lg,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  statValue: { ...typography.title, fontSize: 21, lineHeight: 27, color: colors.textPrimary },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickTile: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 120,
    minHeight: 72,
    padding: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  quickLabel: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  firstUseRow: { flexDirection: 'row', gap: spacing.sm },
  firstUseCard: {
    flex: 1,
    minHeight: 174,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  firstUseIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,214,181,0.1)',
  },
  firstUseTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  firstUseBody: { ...typography.caption, flex: 1, fontSize: 12, color: colors.textMuted },
  libraryLoading: { minHeight: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  libraryLoadingText: { ...typography.caption, color: colors.textMuted },
  pressed: { opacity: 0.68 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
