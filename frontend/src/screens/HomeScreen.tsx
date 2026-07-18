import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';

import { DashboardCustomizer } from '../components/dashboard/DashboardCustomizer';
import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { ContinuityFrame } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/TextField';
import { ConnectionSignal, LibraryFreshnessBanner } from '../components/library/LibraryFreshnessBanner';
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
import { colors, glass, glassBlur, numericTypography, radii, shadows, spacing, typography } from '../theme/tokens';
import { apiErrorMessage, friendlyJobStage } from '../utils/apiError';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';
import { confirmJobCancellation } from '../utils/confirmJobCancellation';

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

function sourceGlyph(url?: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'link-outline';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube') || host.includes('youtu.be')) return 'logo-youtube';
    if (host.includes('soundcloud')) return 'logo-soundcloud';
    if (host.includes('instagram')) return 'logo-instagram';
    if (host.includes('tiktok')) return 'musical-note-outline';
  } catch {
    return 'link-outline';
  }
  return 'globe-outline';
}

function ActiveJobRow({ job, accent, onCancel }: { job: Job; accent: string; onCancel: () => void }) {
  const label = job.result_media ? displayTitle(job.result_media) : job.match_title ?? 'Adding to your library';
  const stage = friendlyJobStage(job.stage_label, job.status === 'pending' ? 'Waiting to start' : 'Preparing media');
  const progress = Math.max(0, Math.min(100, job.progress_pct));

  return (
    <View style={styles.activeJobRow} accessibilityLabel={`${label}, ${stage}, ${Math.round(progress)} percent`}>
      <View style={styles.timelineRail}>
        <View style={styles.jobIcon}>
          <Ionicons name={job.job_type === 'recognize' ? 'sparkles' : sourceGlyph(job.source_url)} size={17} color={accent} />
        </View>
        <View style={styles.timelineSignal}>
          <View style={[styles.timelineSignalFill, { height: `${Math.max(12, progress)}%`, backgroundColor: accent }]} />
        </View>
      </View>
      <View style={styles.jobBody}>
        <View style={styles.jobTitleRow}>
          <Text numberOfLines={1} style={styles.jobTitle}>{label}</Text>
        </View>
        <Text style={styles.timelineMeta}>SOURCE · {job.job_type === 'recognize' ? 'RECOGNITION' : 'LINK IMPORT'}</Text>
        <Text numberOfLines={1} style={styles.jobStage}>{stage}</Text>
        <ProgressBar progress={progress / 100} />
      </View>
      <View style={[styles.timelineEndpoint, { borderColor: `${accent}66` }]}>
        <Text style={[styles.jobPercent, { color: accent }]}>{Math.round(progress)}%</Text>
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
  onRetry,
}: {
  url: string;
  job: Job;
  accent: string;
  onCancel: () => void;
  onRetry: () => void;
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
      <View style={styles.batchTimelineRail}>
        <View style={[styles.batchStatusIcon, { borderColor: `${statusColor}45` }]}>
          <Ionicons name={sourceGlyph(url)} size={14} color={statusColor} />
        </View>
        <View style={styles.batchSignalLine} />
        <View style={[styles.batchEndpoint, { borderColor: `${statusColor}55` }]}>
          <Ionicons name={failed ? 'alert' : complete ? 'checkmark' : 'arrow-down'} size={11} color={statusColor} />
        </View>
      </View>
      <View style={styles.batchLinkBody}>
        <View style={styles.batchLinkHeading}>
          <Text numberOfLines={1} style={styles.batchLinkTitle}>{compactLinkLabel(url)}</Text>
          <Text style={[styles.batchLinkPercent, { color: statusColor }]}>{Math.round(progress)}%</Text>
        </View>
        <Text style={styles.timelineMeta}>SOURCE · {complete ? 'RESOLVED' : failed ? 'NEEDS ATTENTION' : 'IN TRANSIT'}</Text>
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
      ) : failed && job.source_url ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={`Restart ${compactLinkLabel(url)}`}
          hitSlop={4}
          style={({ pressed }) => [styles.batchCancelButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={17} color={accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MediaCard({ media, size, onPress, pinned = false }: { media: Media; size: number; onPress: () => void; pinned?: boolean }) {
  const artist = displayArtist(media);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${displayTitle(media)}${artist ? ` by ${artist}` : ''}`}
      style={({ pressed }) => [styles.recentCard, pinned && styles.pinnedCard, { width: size }, pressed && styles.cardPressed]}
    >
      <View style={[styles.shelfArtworkFrame, pinned && styles.pinnedArtworkFrame]}>
        <Artwork media={media} size="100%" style={styles.artwork} />
        {pinned ? (
          <View style={styles.pinnedStar}>
            <Ionicons name="star" size={11} color={colors.gold} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.recentTitle}>{displayTitle(media)}</Text>
      <Text numberOfLines={1} style={styles.recentArtist}>{artist ?? (media.media_type === 'video' ? 'Video' : 'Unknown artist')}</Text>
    </Pressable>
  );
}

function StatTile({ icon, value, label, accent, lead = false }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; accent: string; lead?: boolean }) {
  return (
    <View style={[styles.statTile, lead && styles.statTileLead]} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.statIconWell, lead && styles.statIconWellLead]}><Ionicons name={icon} size={lead ? 20 : 15} color={accent} /></View>
      <View style={styles.statCopy}>
        <Text style={[styles.statValue, lead && styles.statValueLead]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
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
  const libraryStale = useLibraryStore((state) => state.isStale);
  const libraryLastUpdatedAt = useLibraryStore((state) => state.lastUpdatedAt);
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
  const [playlistInspectionError, setPlaylistInspectionError] = useState<string | null>(null);
  const [inspectingPlaylist, setInspectingPlaylist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
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
    setPlaylistInspectionError(null);
    setInspectingPlaylist(false);
    setDownloadPlaylist(false);
    if (!singleUrl) return undefined;
    if (!networkOnline || backendOnline === false) {
      setPlaylistInspectionError('Offline — playlist details cannot be checked. Your draft is safe.');
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      setInspectingPlaylist(true);
      void downloadsApi
        .inspectDownload(singleUrl)
        .then((inspection) => {
          if (!active) return;
          setPlaylistInspection(inspection);
          setPlaylistInspectionError(null);
          if (!inspection.is_playlist) setDownloadPlaylist(false);
        })
        .catch((caught) => {
          if (!active) return;
          setPlaylistInspectionError(apiErrorMessage(caught, "Couldn't inspect this link. It may be private, unavailable, or temporarily unreachable."));
        })
        .finally(() => {
          if (active) setInspectingPlaylist(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [backendOnline, networkOnline, singleUrl]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void downloadsApi
        .listDownloads()
        .then((items) => {
          if (active) {
            setJobs([...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
            setJobsLoadError(null);
          }
        })
        .catch((caught) => {
          if (active) setJobsLoadError(apiErrorMessage(caught, 'Activity could not refresh. Showing last-known progress.'));
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
    if (offline) {
      setError('Imports need the Starhollow server. Your links will stay here — reconnect, then try again.');
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
      const incoming = extractMediaLinks(text);
      if (incoming.length === 0) {
        toast('No complete http:// or https:// media link was found in the clipboard.', 'info');
        return;
      }
      const current = extractMediaLinks(url);
      const merged = [...new Set([...current, ...incoming])];
      const duplicates = current.length + incoming.length - merged.length;
      setUrl(merged.join('\n'));
      setError(null);
      toast(
        duplicates > 0
          ? `Merged ${incoming.length - duplicates} new ${incoming.length - duplicates === 1 ? 'link' : 'links'}; ${duplicates} duplicate ${duplicates === 1 ? 'was' : 'were'} already in the draft.`
          : `Added ${incoming.length} ${incoming.length === 1 ? 'link' : 'links'} to the draft.`,
        'info',
      );
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't read your clipboard."), 'error');
    }
  }

  function removeDraftLink(link: string) {
    setUrl(parsedUrls.filter((candidate) => candidate !== link).join('\n'));
    setError(null);
  }

  async function handleCancel(job: Job) {
    const name = job.result_media ? displayTitle(job.result_media) : job.match_title ?? compactLinkLabel(job.source_url ?? 'this import');
    if (!(await confirmJobCancellation(name))) return;
    try {
      updateJob(await downloadsApi.cancelDownload(job.id));
      toast('Import cancelled.', 'info');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't cancel this import."), 'error');
    }
  }

  async function handleRetry(job: Job) {
    try {
      updateJob(await downloadsApi.retryDownload(job.id));
      toast('Import restarted.', 'success');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't restart this import."), 'error');
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
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(99,214,181,0.10)', 'rgba(9,17,25,0.02)', 'rgba(169,155,219,0.08)']}
            locations={[0, 0.58, 1]}
            style={styles.importHorizon}
          />
          <View style={styles.importHeading}>
            <View style={styles.importIcon}>
              <Ionicons name="link" size={18} color={accent} />
            </View>
            <View style={styles.importHeadingCopy}>
              <Text style={[styles.importEyebrow, { color: accent }]}>IMPORT LINKS</Text>
              <Text style={[styles.importTitle, smallPhone && styles.importTitleSmall]}>Bring a track home.</Text>
            </View>
          </View>

          <View style={styles.observatoryStep}>
            <Text style={[styles.observatoryStepNumber, { color: accent }]}>01</Text>
            <Text style={styles.observatoryStepLabel}>CAPTURE SIGNAL</Text>
            <View style={styles.observatoryStepRule} />
          </View>
          <View style={[styles.inputRow, styles.inputRowMultiline, glassBlur]}>
            <TextField
              value={url}
              onChangeText={(value) => {
                setUrl(value);
                if (error) setError(null);
              }}
              accessibilityLabel="Media link"
              accessibilityHint="Paste one or more links separated by spaces or new lines"
              placeholder="Paste links — one per line or space-separated"
              selectionColor={accent}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
              style={styles.input}
              containerStyle={styles.importField}
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

          {parsedUrls.length > 0 ? (
            <View style={styles.draftList} accessibilityLabel={`${parsedUrls.length} links in import draft`}>
              {parsedUrls.map((link, index) => (
                <View key={link} style={styles.draftRow}>
                  <View style={styles.draftIndex}><Text style={styles.draftIndexText}>{index + 1}</Text></View>
                  <Text numberOfLines={1} style={styles.draftLink}>{link}</Text>
                  <Pressable onPress={() => removeDraftLink(link)} accessibilityRole="button" accessibilityLabel={`Remove link ${index + 1} from import draft`} hitSlop={8} style={({ pressed }) => [styles.draftRemove, pressed && styles.pressed]}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

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

          {playlistInspectionError ? (
            <View style={styles.inspectionNotice} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.inspectionNoticeText}>{playlistInspectionError}</Text>
            </View>
          ) : null}

          <View style={styles.observatoryStep}>
            <Text style={[styles.observatoryStepNumber, { color: accent }]}>02</Text>
            <Text style={styles.observatoryStepLabel}>CONFIRM SCOPE</Text>
            <View style={styles.observatoryStepRule} />
          </View>
          <View style={styles.scopeRow} accessibilityLiveRegion="polite">
            <Ionicons name={offline ? 'cloud-offline-outline' : downloadPlaylist && playlistDetected ? 'list' : 'link'} size={16} color={offline ? colors.warning : accent} />
            <Text style={styles.scopeText}>
              {offline
                ? 'Server offline — cached browsing and playback still work; this draft will remain ready.'
                : downloadPlaylist && playlistDetected
                  ? 'Final scope: every available entry in the detected playlist.'
                  : `Final scope: only the ${parsedUrls.length === 1 ? 'shared link' : `${parsedUrls.length} shared links`} shown above.`}
            </Text>
          </View>

          <View style={styles.observatoryStep}>
            <Text style={[styles.observatoryStepNumber, { color: accent }]}>03</Text>
            <Text style={styles.observatoryStepLabel}>CHOOSE FORMAT</Text>
            <View style={styles.observatoryStepRule} />
          </View>
          <SegmentedControl
            options={MEDIA_KINDS}
            value={mediaKind}
            onChange={setMediaKind}
            accessibilityLabel="Import type"
          />

          <View>
            <View style={styles.observatoryStep}>
              <Text style={[styles.observatoryStepNumber, { color: accent }]}>04</Text>
              <Text style={styles.observatoryStepLabel}>SET QUALITY</Text>
              <View style={styles.observatoryStepRule} />
            </View>
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

          <View style={styles.observatoryStep}>
            <Text style={[styles.observatoryStepNumber, { color: accent }]}>05</Text>
            <Text style={styles.observatoryStepLabel}>COMMIT TO YOUR HOLLOW</Text>
            <View style={styles.observatoryStepRule} />
          </View>

          <Button
            label={offline ? 'Reconnect to import' : parsedUrls.length > 1 ? `Add ${parsedUrls.length} links to library` : 'Add to library'}
            onPress={() => void handleSubmit()}
            disabled={parsedUrls.length === 0 || offline}
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
                    onRetry={() => void handleRetry(job)}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </GlassPanel>
    ),

    inProgress: () =>
      activeJobs.length === 0 && !jobsLoadError ? null : (
        <View style={{ marginTop: sectionGap }}>
          <SectionHeader title="In progress" actionLabel={jobsLoadError ? 'Open Activity' : 'See all'} onAction={() => openTab('Activity')} style={styles.sectionHeader} />
          <GlassPanel style={styles.activityPanel}>
            {jobsLoadError ? (
              <ConnectionSignal
                compact
                title="Progress may be out of date"
                detail={`${jobsLoadError} Saved job history is still usable.`}
                timestamp="Open Activity to refresh the signal."
                actionLabel="Open Activity"
                actionAccessibilityLabel="Progress is stale. Open Activity to retry."
                onAction={() => openTab('Activity')}
                icon="pulse-outline"
              />
            ) : null}
            {activeJobs.slice(0, 2).map((job, index) => (
              <View key={job.id}>
                {index > 0 || jobsLoadError ? <View style={styles.divider} /> : null}
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
          <GlassPanel style={styles.continuePanel} edgeColor={`${accent}70`}>
            <View style={styles.continueContent}>
              <View style={[styles.continueArtworkFrame, { borderColor: `${accent}52` }]}>
                <Artwork media={currentMedia} size={compact ? 82 : isDesktop ? 122 : 98} priority borderRadius={radii.md} />
              </View>
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
            contentContainerStyle={[styles.recentRow, styles.pinnedRow]}
            snapToInterval={cardSize + spacing.md}
            decelerationRate="fast"
          >
            {pinnedItems.map((media) => (
              <MediaCard key={media.id} media={media} size={cardSize} pinned onPress={() => void playFrom(pinnedItems, media)} />
            ))}
          </ScrollView>
        </View>
      ),

    offline: () => (
      <View style={{ marginTop: sectionGap }}>
        <SectionHeader title="Offline shelf" style={styles.sectionHeader} />
        <GlassPanel style={[styles.offlinePanel, offlineShelfEmpty && styles.offlinePanelEmpty]}>
          {offlineShelfEmpty ? (
            <View style={styles.offlineEmptyScene}>
              <View style={styles.offlineMotif} accessible accessibilityLabel="A device waiting for music from your private cloud">
                <View style={styles.offlineCloud}>
                  <Ionicons name="cloud-outline" size={27} color={colors.cyan} />
                </View>
                <View style={styles.offlineSignalDashed} />
                <View style={styles.offlineDevice}>
                  <Ionicons name="musical-note" size={18} color={colors.gold} />
                  <View style={styles.offlineDeviceBar} />
                </View>
              </View>
              <View style={styles.offlineEmptyCopy}>
                <Text style={styles.offlineEmptyEyebrow}>YOUR POCKET CONSTELLATION</Text>
                <Text style={styles.offlineEmptyTitle}>Nothing saved yet</Text>
                <Text style={styles.offlineEmptyBody}>Use “Save offline” on any track to keep a small part of your hollow on this device.</Text>
              </View>
              <Button label="Offline settings" onPress={() => navigation.navigate('Settings')} variant="secondary" style={styles.offlineEmptyAction} />
            </View>
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
        <GlassPanel style={styles.statsConstellation} variant="quiet">
          <StatTile icon="time-outline" value={`${stats.minutes}m`} label="Listening · last 30 days" accent={accent} lead />
          <View style={styles.statsRule} />
          <View style={styles.statsSupportRow}>
            <StatTile icon="musical-notes-outline" value={String(stats.tracks)} label="Tracks" accent={accent} />
            <StatTile icon="videocam-outline" value={String(stats.videos)} label="Videos" accent={accent} />
            <StatTile icon="play-outline" value={String(stats.plays)} label="Total plays" accent={accent} />
          </View>
        </GlassPanel>
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
              <View style={styles.quickIconWell}><Ionicons name={action.icon} size={19} color={accent} /></View>
              <View style={styles.quickCopy}>
                <Text style={styles.quickLabel}>{action.label}</Text>
                <Text style={styles.quickHint}>Open portal</Text>
              </View>
              <Ionicons name="arrow-forward" size={15} color={colors.textMuted} />
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
                <View style={styles.todayEyebrowRow}>
                  <Text style={[styles.eyebrow, { color: accent }]}>TODAY</Text>
                  <View style={[styles.todayRule, { backgroundColor: `${accent}55` }]} />
                  <Text style={styles.todayEdition}>STARHOLLOW · DAILY EDITION</Text>
                </View>
                <Text style={styles.title}>{dayGreeting()}{firstName ? `,\n${firstName}.` : '.'}</Text>
                <View style={styles.editorialDeck}>
                  <View style={[styles.editorialDeckRule, { backgroundColor: accent }]} />
                  <Text style={styles.subtitle}>Keep what you find. Play it your way.</Text>
                </View>
              </View>
              <View style={[styles.headerActions, glassBlur]}>
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

          <LibraryFreshnessBanner
            stale={libraryStale}
            lastUpdatedAt={libraryLastUpdatedAt}
            refreshing={libraryLoading}
            onRetry={() => void refreshLibrary()}
          />

          <ContinuityFrame stateKey={showFirstUse ? 'empty' : 'content'} minHeight={360}>
          {visibleWidgets.map((id, index) => {
            const rendered = widgetRenderers[id]();
            if (!rendered) return null;
            return (
              <Reveal key={id} chapter={1} chapterIndex={index}>
                {rendered}
              </Reveal>
            );
          })}

          {showFirstUse ? (
            <Reveal chapter={2} style={{ marginTop: sectionGap }}>
              <GlassPanel style={styles.firstUseScene} edgeColor="rgba(233,205,126,0.30)">
                <View pointerEvents="none" style={styles.firstUseMoon} />
                <View style={styles.firstUseHeading}>
                  <Text style={styles.firstUseEyebrow}>FIRST NIGHT IN STARHOLLOW</Text>
                  <Text style={styles.firstUseHeadline}>Begin your hollow.</Text>
                  <Text style={styles.firstUseDeck}>Catch the song in the air, or open the door to music you already keep.</Text>
                </View>
                <View style={styles.firstUseRow}>
                  <Pressable
                  onPress={() => openTab('Recognize')}
                  accessibilityRole="button"
                  accessibilityLabel="Identify music playing nearby"
                  style={({ pressed }) => [styles.firstUseCard, glassBlur, pressed && styles.cardPressed]}
                >
                  <View style={styles.firstUseIllustration}>
                    <View style={[styles.firstUseOrbit, { borderColor: `${accent}38` }]} />
                    <View style={styles.firstUseIcon}><Ionicons name="mic" size={24} color={accent} /></View>
                    <Ionicons name="musical-notes-outline" size={13} color={colors.gold} style={styles.firstUseSpark} />
                  </View>
                  <View style={styles.firstUseCardCopy}>
                    <Text style={styles.firstUseTitle}>Identify music</Text>
                    <Text style={styles.firstUseBody}>Hear something? Name it in seconds.</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                  onPress={() => navigation.navigate('Telegram')}
                  accessibilityRole="button"
                  accessibilityLabel="Import from Telegram"
                  style={({ pressed }) => [styles.firstUseCard, glassBlur, pressed && styles.cardPressed]}
                >
                  <View style={styles.firstUseIllustration}>
                    <View style={[styles.firstUseOrbit, { borderColor: 'rgba(169,155,219,0.34)' }]} />
                    <View style={[styles.firstUseIcon, styles.firstUseIconViolet]}><Ionicons name="paper-plane" size={24} color={colors.violet} /></View>
                    <Ionicons name="sparkles" size={13} color={colors.gold} style={styles.firstUseSpark} />
                  </View>
                  <View style={styles.firstUseCardCopy}>
                    <Text style={styles.firstUseTitle}>Telegram</Text>
                    <Text style={styles.firstUseBody}>Bring saved audio into your library.</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              </GlassPanel>
            </Reveal>
          ) : null}
          </ContinuityFrame>

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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  todayEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { ...typography.eyebrow },
  todayRule: { width: 28, height: 1 },
  todayEdition: { ...typography.eyebrow, flexShrink: 1, fontSize: 7, lineHeight: 10, letterSpacing: 1.2, color: colors.textMuted },
  title: { ...typography.display, fontSize: 43, lineHeight: 47, letterSpacing: -1.65, color: colors.textPrimary },
  editorialDeck: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  editorialDeckRule: { width: 2, borderRadius: radii.pill },
  subtitle: { ...typography.body, flexShrink: 1, maxWidth: 430, color: colors.textMuted },
  importPanel: { marginBottom: spacing.sm },
  importContent: { position: 'relative', gap: spacing.md, overflow: 'hidden' },
  importHorizon: {
    position: 'absolute',
    left: -80,
    right: -80,
    top: -60,
    height: 240,
    borderBottomLeftRadius: 240,
    borderBottomRightRadius: 240,
    opacity: 0.74,
  },
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
  observatoryStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  observatoryStepNumber: { ...numericTypography.rank, width: 22, fontSize: 10, lineHeight: 12 },
  observatoryStepLabel: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.55, color: colors.textMuted },
  observatoryStepRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: glass.stroke },
  inputRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: 5,
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.strokeStrong,
    ...shadows.low,
  },
  inputRowMultiline: { alignItems: 'flex-start', paddingVertical: 5 },
  importField: { flex: 1, minWidth: 0 },
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
  draftList: { gap: 2, padding: 3, borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: glass.stroke, backgroundColor: glass.fillDeep },
  draftRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.sm, backgroundColor: glass.fillBright },
  draftIndex: { width: 22, height: 22, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.tintPrimary },
  draftIndexText: { ...typography.caption, fontSize: 10, color: colors.cyan },
  draftLink: { ...typography.caption, flex: 1, color: colors.textSecondary },
  draftRemove: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
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
  inspectionNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: 'rgba(242,183,93,0.08)' },
  inspectionNoticeText: { ...typography.caption, flex: 1, color: colors.textSecondary },
  formatLabel: { ...typography.eyebrow, fontSize: 9, lineHeight: 12, letterSpacing: 1.8, color: colors.textMuted, marginBottom: spacing.sm },
  formatRow: { gap: spacing.sm, paddingRight: spacing.sm, paddingTop: spacing.sm },
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
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: glass.fillDeep, borderWidth: 1, borderColor: glass.stroke },
  scopeText: { ...typography.caption, flex: 1, color: colors.textSecondary },
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
  batchLinkRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  batchTimelineRail: { width: 30, alignSelf: 'stretch', alignItems: 'center' },
  batchStatusIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: glass.fillDeep,
  },
  batchSignalLine: { flex: 1, width: 1, minHeight: 8, backgroundColor: glass.strokeStrong },
  batchEndpoint: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: glass.fillDeep,
  },
  batchLinkBody: { flex: 1, minWidth: 0, gap: 4 },
  batchLinkHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  batchLinkTitle: { ...typography.caption, flex: 1, fontFamily: 'Sora_500Medium', color: colors.textPrimary },
  batchLinkPercent: { ...typography.caption, fontFamily: 'Sora_600SemiBold', fontSize: 10 },
  batchLinkStage: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  batchLinkStageFailed: { color: colors.danger },
  timelineMeta: { ...typography.eyebrow, fontSize: 7, lineHeight: 9, letterSpacing: 1.1, color: colors.textMuted },
  batchCancelButton: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  batchDivider: { height: 1, backgroundColor: glass.stroke },
  sectionHeader: { marginBottom: spacing.sm },
  activityPanel: { paddingHorizontal: spacing.md, backgroundColor: glass.fillDeep },
  jobsStale: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  jobsStaleCopy: { flex: 1, gap: 2 },
  jobsStaleTitle: { ...typography.subtitle, fontSize: 13, color: colors.warning },
  jobsStaleDetail: { ...typography.caption, color: colors.textMuted },
  activeJobRow: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  timelineRail: { width: 38, alignSelf: 'stretch', alignItems: 'center' },
  jobIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,214,181,0.11)',
  },
  timelineSignal: { flex: 1, width: 2, minHeight: 16, marginTop: 3, borderRadius: radii.pill, overflow: 'hidden', backgroundColor: glass.stroke },
  timelineSignalFill: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: radii.pill },
  timelineEndpoint: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: glass.fillDeep,
  },
  jobBody: { flex: 1, minWidth: 0, gap: 5 },
  jobTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  jobTitle: { ...typography.subtitle, flex: 1, fontSize: 14, color: colors.textPrimary },
  jobPercent: { ...typography.caption, fontFamily: 'Sora_600SemiBold', fontSize: 11 },
  jobStage: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  cancelButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: glass.stroke },
  continuePanel: { padding: spacing.md, backgroundColor: glass.fillDeep },
  continueContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  continueArtworkFrame: { padding: 3, borderRadius: radii.lg, borderWidth: 1, backgroundColor: glass.fillBright, ...shadows.card },
  continueCopy: { flex: 1, minHeight: 48, justifyContent: 'center' },
  continueEyebrow: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.7 },
  continueTitle: { ...typography.subtitle, color: colors.textPrimary },
  continueArtist: { ...typography.caption, color: colors.textMuted },
  resumeButton: {
    width: 54,
    height: 54,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  recentRow: { gap: spacing.md, paddingLeft: spacing.xs, paddingRight: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.md },
  pinnedRow: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  recentCard: { gap: 4 },
  pinnedCard: { transform: [{ translateY: -2 }] },
  shelfArtworkFrame: { width: '100%', aspectRatio: 1, padding: 1, borderRadius: radii.md, borderWidth: 1, borderColor: glass.stroke, backgroundColor: glass.fillDeep },
  pinnedArtworkFrame: { padding: 3, borderColor: 'rgba(233,205,126,0.34)', backgroundColor: glass.fillBright, ...shadows.card },
  artwork: { width: '100%', height: '100%' },
  pinnedStar: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(11,20,17,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(233,205,126,0.42)',
  },
  recentTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  recentArtist: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  offlinePanel: { padding: spacing.md },
  offlinePanelEmpty: { padding: 0 },
  offlineEmptyScene: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  offlineMotif: { width: 150, height: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  offlineCloud: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  offlineSignalDashed: { width: 31, height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.surfaceBorderStrong },
  offlineDevice: {
    width: 45,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.surfaceBorderStrong,
    backgroundColor: glass.fillDeep,
  },
  offlineDeviceBar: { width: 14, height: 2, borderRadius: radii.pill, backgroundColor: colors.surfaceBorderStrong },
  offlineEmptyCopy: { alignItems: 'center', gap: spacing.xs, maxWidth: 390 },
  offlineEmptyEyebrow: { ...typography.eyebrow, fontSize: 8, color: colors.cyan },
  offlineEmptyTitle: { ...typography.sectionTitle, fontSize: 19, lineHeight: 25, color: colors.textPrimary, textAlign: 'center' },
  offlineEmptyBody: { ...typography.body, fontSize: 12, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
  offlineEmptyAction: { minWidth: 170 },
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offlineDot: { width: 9, height: 9, borderRadius: radii.pill },
  offlineCopy: { flex: 1 },
  offlineTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  offlineDetail: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  statsConstellation: { padding: spacing.md, backgroundColor: glass.fillDeep },
  statsRule: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm, backgroundColor: glass.strokeStrong },
  statsSupportRow: { flexDirection: 'row' },
  statTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: glass.strokeStrong,
  },
  statTileLead: { minHeight: 96, borderRightWidth: 0, paddingHorizontal: spacing.md },
  statIconWell: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: glass.fillBright },
  statIconWellLead: { width: 46, height: 46, backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  statCopy: { flex: 1, minWidth: 0 },
  statValue: { ...numericTypography.total, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  statValueLead: { ...typography.display, fontVariant: ['tabular-nums'], fontSize: 34, lineHeight: 39, color: colors.textPrimary },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    minHeight: 78,
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  quickIconWell: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke },
  quickCopy: { flex: 1, minWidth: 0 },
  quickLabel: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary },
  quickHint: { ...typography.caption, fontSize: 9, color: colors.textMuted },
  firstUseScene: { padding: spacing.lg, backgroundColor: glass.fillDeep },
  firstUseMoon: { position: 'absolute', width: 220, height: 220, right: -70, top: -105, borderRadius: radii.pill, backgroundColor: 'rgba(169,155,219,0.055)', borderWidth: 1, borderColor: 'rgba(233,205,126,0.08)' },
  firstUseHeading: { maxWidth: 510, gap: spacing.xs, marginBottom: spacing.lg },
  firstUseEyebrow: { ...typography.eyebrow, fontSize: 8, color: colors.gold },
  firstUseHeadline: { ...typography.display, fontSize: 29, lineHeight: 35, color: colors.textPrimary },
  firstUseDeck: { ...typography.body, fontSize: 13, lineHeight: 20, color: colors.textMuted },
  firstUseRow: { flexDirection: 'row', gap: spacing.sm },
  firstUseCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 190,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: glass.fillBright,
    borderWidth: 1,
    borderColor: glass.stroke,
  },
  firstUseIllustration: { position: 'relative', height: 72, alignItems: 'center', justifyContent: 'center' },
  firstUseOrbit: { position: 'absolute', width: 68, height: 68, borderRadius: radii.pill, borderWidth: 1 },
  firstUseIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.tintPrimary,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
  },
  firstUseIconViolet: { backgroundColor: 'rgba(169,155,219,0.12)', borderColor: 'rgba(169,155,219,0.28)' },
  firstUseSpark: { position: 'absolute', right: '20%', top: 4 },
  firstUseCardCopy: { flex: 1, gap: spacing.xs },
  firstUseTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  firstUseBody: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  libraryLoading: { minHeight: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  libraryLoadingText: { ...typography.caption, color: colors.textMuted },
  pressed: { opacity: 0.68 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
