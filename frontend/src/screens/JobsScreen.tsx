import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { Button } from '../components/ui/Button';
import { DataRow, type DataRowTone } from '../components/ui/DataRow';
import { EmptyState } from '../components/ui/EmptyState';
import { RecoverableError } from '../components/ui/FormError';
import { GlassPanel } from '../components/ui/GlassPanel';
import { PressableScale } from '../components/ui/PressableScale';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import { useBottomChromeClearance } from '../hooks/useBottomChromeClearance';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { RootStackParamList } from '../navigation/types';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { toast } from '../store/toastStore';
import { useVideoPlayerStore } from '../store/videoPlayerStore';
import { colors, glass, motion, numericTypography, radii, spacing, stateLayers, typography } from '../theme/tokens';
import { apiErrorMessage, friendlyJobError, friendlyJobStage } from '../utils/apiError';
import { displayTitle } from '../utils/mediaDisplay';
import { confirmJobCancellation } from '../utils/confirmJobCancellation';

const SHOW_FINISHED_KEY = 'sh.activity.showFinished.v1';

const STATUS_META: Record<Job['status'], { label: string; icon: keyof typeof Ionicons.glyphMap; tone: DataRowTone }> = {
  pending: { label: 'Queued', icon: 'time-outline', tone: 'neutral' },
  in_progress: { label: 'In progress', icon: 'sync-outline', tone: 'active' },
  complete: { label: 'Complete', icon: 'checkmark', tone: 'success' },
  failed: { label: 'Needs attention', icon: 'alert', tone: 'attention' },
  cancelled: { label: 'Cancelled', icon: 'close', tone: 'neutral' },
};

const STATUS_COLOR: Record<Job['status'], string> = {
  pending: colors.textMuted,
  in_progress: colors.cyan,
  complete: colors.success,
  failed: colors.danger,
  cancelled: colors.textMuted,
};

function sourceName(url: string | null): string {
  if (!url) return 'Media import';
  if (url.startsWith('telegram:')) return 'Telegram import';
  if (/youtu\.?be/i.test(url)) return 'YouTube import';
  if (/tiktok/i.test(url)) return 'TikTok import';
  if (/instagram/i.test(url)) return 'Instagram import';
  try {
    return `${new URL(url).hostname.replace(/^www\./, '')} import`;
  } catch {
    return 'Link import';
  }
}

function sourceIcon(url: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'link';
  if (url.startsWith('telegram:')) return 'paper-plane';
  if (/youtu\.?be/i.test(url)) return 'logo-youtube';
  if (/tiktok/i.test(url)) return 'logo-tiktok';
  if (/instagram/i.test(url)) return 'logo-instagram';
  return 'link';
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function jobTitle(job: Job): string {
  if (job.result_media) return displayTitle(job.result_media);
  return job.match_title ?? sourceName(job.source_url);
}

function ActivitySkeleton() {
  const reduceMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.stopAnimation();
    if (reduceMotion) {
      sweep.setValue(0.32);
      return () => sweep.stopAnimation();
    }
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: motion.duration.continuous, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep]);

  return (
    <View style={styles.loadingState} accessibilityRole="progressbar" accessibilityLabel="Loading activity">
      <View style={styles.loadingList}>
        {[0, 1, 2].map((index) => (
          <GlassPanel key={index} style={styles.skeletonRow}>
            <View pointerEvents="none" style={styles.skeletonEdge} />
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonCopy}>
              <View style={styles.skeletonTop}>
                <View style={styles.skeletonStatus} />
                <View style={[styles.skeletonLine, styles.skeletonTime]} />
              </View>
              <View style={[styles.skeletonLine, styles.skeletonTitle]} />
              <View style={[styles.skeletonLine, styles.skeletonMeta]} />
              <View style={[styles.skeletonLine, styles.skeletonDetail]} />
            </View>
            <View style={styles.skeletonAction} />
            <Animated.View pointerEvents="none" style={[styles.skeletonSweep, { opacity: reduceMotion ? 0.1 : 0.18, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-100, 620] }) }] }]} />
          </GlassPanel>
        ))}
      </View>
      <Text style={styles.loadingText}>Gathering your recent activity…</Text>
    </View>
  );
}

function JobRow({ job, onCancel, onRetry, onOpen }: { job: Job; onCancel: () => void; onRetry: () => void; onOpen: () => void }) {
  const meta = STATUS_META[job.status];
  const running = job.status === 'in_progress' || job.status === 'pending';
  const title = jobTitle(job);
  const progress = Math.max(0, Math.min(100, job.progress_pct));
  const detail = job.status === 'failed'
    ? friendlyJobError(job.error_message)
    : friendlyJobStage(job.stage_label, meta.label);

  const trailingAction = running ? (
    <PressableScale
      onPress={onCancel}
      accessibilityLabel={`Cancel ${title}`}
      scaleTo={0.9}
      hoverScaleTo={1.04}
      style={styles.iconButton}
    >
      <Ionicons name="close" size={19} color={colors.textSecondary} />
    </PressableScale>
  ) : (job.status === 'failed' || job.status === 'cancelled') && job.source_url ? (
    <PressableScale
      onPress={onRetry}
      accessibilityLabel={`Retry ${title}`}
      scaleTo={0.9}
      hoverScaleTo={1.04}
      style={[styles.iconButton, styles.retryButton]}
    >
      <Ionicons name="refresh" size={19} color={colors.cyan} />
    </PressableScale>
  ) : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title} ${meta.label.toLowerCase()} details`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <DataRow
      title={title}
      status={{ label: meta.label, tone: meta.tone }}
      icon={meta.icon}
      leading={
        running || job.status === 'complete' ? (
          <ProgressRing progress={job.status === 'complete' ? 1 : progress / 100} complete={job.status === 'complete'} size={48} strokeWidth={3.5}>
            {job.status !== 'complete' ? <Text style={styles.progressText}>{Math.round(progress)}%</Text> : null}
          </ProgressRing>
        ) : undefined
      }
      subtitle={
        <View style={styles.jobSourceRow}>
          <Ionicons name={sourceIcon(job.source_url)} size={12} color={colors.textMuted} />
          <Text style={styles.jobSource}>{sourceName(job.source_url).replace(' import', '').toUpperCase()}</Text>
        </View>
      }
      meta={detail}
      metaTone={job.status === 'failed' ? 'attention' : 'muted'}
      metaNumberOfLines={job.status === 'failed' ? 2 : 1}
      timestamp={timeAgo(job.updated_at)}
      trailingAction={trailingAction}
      />
    </Pressable>
  );
}

export function JobsScreen({ embedded = false }: { embedded?: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const bottomChromeClearance = useBottomChromeClearance();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const upsertMedia = useLibraryStore((state) => state.upsert);
  const playQueue = usePlayerStore((state) => state.playQueue);

  useEffect(() => {
    void AsyncStorage.getItem(SHOW_FINISHED_KEY).then((saved) => {
      if (saved !== null) setShowFinished(saved !== 'false');
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await downloadsApi.listDownloads();
      setJobs([...data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    } catch (caught) {
      setLoadError(apiErrorMessage(caught, "Couldn't load your activity."));
      setJobs((current) => current ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = useMemo(
    () => jobs?.filter((job) => job.status === 'pending' || job.status === 'in_progress') ?? [],
    [jobs],
  );
  const finished = useMemo(
    () => jobs?.filter((job) => job.status !== 'pending' && job.status !== 'in_progress') ?? [],
    [jobs],
  );
  const activeIds = active.map((job) => job.id).join('|');

  const updateJob = useCallback((updated: Job) => {
    setJobs((current) => {
      if (!current) return [updated];
      const exists = current.some((job) => job.id === updated.id);
      return exists ? current.map((job) => (job.id === updated.id ? updated : job)) : [updated, ...current];
    });
    setSelectedJob((current) => current?.id === updated.id ? updated : current);
    if (updated.status === 'complete' && updated.result_media) upsertMedia(updated.result_media);
  }, [upsertMedia]);

  useEffect(() => {
    if (!isFocused || !activeIds) return undefined;
    const unsubscribers = active.map((job) => watchJob(job.id, updateJob));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // Subscribe again only when active job membership changes, not on every progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, isFocused, updateJob]);

  async function handleCancel(job: Job) {
    if (!(await confirmJobCancellation(jobTitle(job)))) return;
    try {
      updateJob(await downloadsApi.cancelDownload(job.id));
      toast('Import cancelled.', 'info');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't cancel this import."), 'error');
    }
  }

  async function handleRetry(job: Job) {
    try {
      const replacement = await downloadsApi.retryDownload(job.id);
      updateJob(replacement);
      toast('Import restarted.', 'success');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't restart this import."), 'error');
    }
  }

  function toggleFinished() {
    const next = !showFinished;
    setShowFinished(next);
    void AsyncStorage.setItem(SHOW_FINISHED_KEY, String(next));
    toast(next ? 'Finished activity restored.' : 'Finished activity hidden. Use “Show history” to restore it.', 'info');
  }

  async function openJob(job: Job) {
    if (job.status === 'complete' && job.result_media) {
      if (job.result_media.media_type === 'video') {
        useVideoPlayerStore.getState().openExpanded(job.result_media.id);
      } else {
        await playQueue([job.result_media], 0);
        navigation.navigate('Player');
      }
      return;
    }
    setSelectedJob(job);
  }

  function goToday() {
    navigation.navigate('Main', { screen: 'Home' });
  }

  const activityEmpty = jobs !== null && !loadError && jobs.length === 0;
  const visibleJobs = [...active, ...(showFinished ? finished : [])];

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={760}>
        <FlatList
          data={visibleJobs}
          keyExtractor={(job) => job.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            embedded && { paddingBottom: bottomChromeClearance },
            activityEmpty && styles.scrollEmpty,
          ]}
          ListHeaderComponent={<>
          <View style={styles.headerRow}>
            {!embedded ? (
              <PressableScale
                onPress={() => navigation.goBack()}
                accessibilityLabel="Go back"
                scaleTo={0.92}
                hoverScaleTo={1.03}
                style={styles.headerButton}
              >
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </PressableScale>
            ) : null}
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>YOUR IMPORTS</Text>
              <Text style={styles.title}>Activity</Text>
              <Text style={styles.subtitle}>Follow every download from link to library.</Text>
            </View>
            {embedded ? <SidebarTrigger size={40} /> : <View style={styles.headerButtonPlaceholder} />}
          </View>

          {jobs && jobs.length > 0 ? (
            <GlassPanel style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{active.length}</Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{finished.filter((job) => job.status === 'complete').length}</Text>
                <Text style={styles.summaryLabel}>Completed</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, finished.some((job) => job.status === 'failed') && styles.summaryValueAttention]}>
                  {finished.filter((job) => job.status === 'failed').length}
                </Text>
                <Text style={styles.summaryLabel}>Attention</Text>
              </View>
            </GlassPanel>
          ) : null}

          {jobs === null ? (
            <ActivitySkeleton />
          ) : loadError ? (
            <RecoverableError
              title="Activity is unavailable"
              message={loadError}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          ) : jobs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Nothing in motion"
                subtitle="Imports you start on Today will appear here with live progress."
                icon="pulse-outline"
                motif="signal"
                minHeight={240}
                actionLabel="Import your first track"
                onAction={goToday}
              />
            </View>
          ) : null}

          {jobs && jobs.length > 0 ? (
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{active.length > 0 ? 'IN PROGRESS' : showFinished ? 'HISTORY' : 'HISTORY HIDDEN'}</Text>
              {finished.length > 0 ? (
                <PressableScale onPress={toggleFinished} accessibilityLabel={showFinished ? 'Hide finished activity' : 'Show finished activity'} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>{showFinished ? 'Hide finished' : `Show history (${finished.length})`}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
          </>}
          renderItem={({ item, index }) => {
            const beginsHistory = showFinished && finished.length > 0 && index === active.length;
            const running = item.status === 'pending' || item.status === 'in_progress';
            const selected = selectedJob?.id === item.id;
            return (
              <View style={[styles.rowReveal, running && styles.timelineRow]}>
                {beginsHistory && active.length > 0 ? (
                  <View style={styles.historyDivider}>
                    <View style={styles.historyRule} />
                    <Text style={styles.sectionTitle}>HISTORY</Text>
                    <View style={styles.historyRule} />
                  </View>
                ) : null}
                {running ? (
                  <View pointerEvents="none" style={styles.signalRail}>
                    <View style={styles.signalNode} />
                  </View>
                ) : null}
                <JobRow
                  job={item}
                  onCancel={() => void handleCancel(item)}
                  onRetry={() => void handleRetry(item)}
                  onOpen={() => void openJob(item)}
                />
                {selected ? (
                  <GlassPanel style={[styles.detailPanel, { borderColor: STATUS_COLOR[item.status] }]}>
                    <View pointerEvents="none" style={[styles.detailAccent, { backgroundColor: STATUS_COLOR[item.status] }]} />
                    <View style={styles.detailHeading}>
                      <View style={[styles.detailGlyph, { borderColor: STATUS_COLOR[item.status] }]}>
                        <Ionicons name={sourceIcon(item.source_url)} size={18} color={STATUS_COLOR[item.status]} />
                      </View>
                      <View style={styles.detailCopy}>
                        <Text style={[styles.detailEyebrow, { color: STATUS_COLOR[item.status] }]}>{STATUS_META[item.status].label.toUpperCase()} · {sourceName(item.source_url).toUpperCase()}</Text>
                        <Text style={styles.detailTitle}>{jobTitle(item)}</Text>
                      </View>
                      <PressableScale onPress={() => setSelectedJob(null)} accessibilityLabel="Close import details" style={styles.iconButton}>
                        <Ionicons name="close" size={18} color={colors.textSecondary} />
                      </PressableScale>
                    </View>
                    <Text selectable style={styles.detailSource}>{item.source_url ?? 'No source link recorded'}</Text>
                    <Text style={styles.detailBody}>{item.error_message ? friendlyJobError(item.error_message) : friendlyJobStage(item.stage_label, STATUS_META[item.status].label)}</Text>
                    {(item.status === 'failed' || item.status === 'cancelled') && item.source_url ? (
                      <Button label="Restart import" icon="refresh" onPress={() => void handleRetry(item)} style={styles.detailAction} />
                    ) : null}
                  </GlassPanel>
                ) : null}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
        />
      </ScreenContainer>
      {embedded ? <MiniPlayerBar /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingBottom: spacing.xxl },
  scrollEmpty: { flexGrow: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  headerCopy: { flex: 1 },
  eyebrow: { ...typography.eyebrow, color: colors.cyan, marginBottom: spacing.xs },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerButtonPlaceholder: { width: 44 },
  summaryRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...numericTypography.total, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  summaryValueAttention: { color: colors.danger },
  summaryLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  summaryDivider: { width: 1, height: 30, backgroundColor: glass.stroke },
  loadingState: { minHeight: 240, width: '100%', justifyContent: 'center', gap: spacing.md },
  loadingList: { width: '100%', gap: spacing.sm },
  skeletonRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  skeletonEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: glass.strokeStrong },
  skeletonIcon: { width: 48, height: 48, borderRadius: radii.control, backgroundColor: stateLayers.skeleton.raised, borderWidth: 1, borderColor: glass.stroke },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skeletonLine: { height: 9, borderRadius: radii.pill, backgroundColor: stateLayers.skeleton.raised },
  skeletonTitle: { width: '68%' },
  skeletonMeta: { width: '42%', height: 7 },
  skeletonDetail: { width: '78%', height: 6 },
  skeletonTime: { width: 42, height: 6 },
  skeletonStatus: { width: 64, height: 20, borderRadius: radii.pill, backgroundColor: stateLayers.skeleton.raised },
  skeletonAction: { width: 38, height: 38, borderRadius: radii.control, backgroundColor: stateLayers.skeleton.raised },
  skeletonSweep: { position: 'absolute', top: 0, bottom: 0, width: 82, backgroundColor: stateLayers.skeleton.sweep },
  loadingText: { ...typography.caption, color: colors.textMuted },
  errorPanel: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,131,140,0.1)',
    marginBottom: spacing.xs,
  },
  errorTitle: { ...typography.title, fontSize: 19, color: colors.textPrimary, textAlign: 'center' },
  errorBody: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  retryLoadButton: { marginTop: spacing.sm, minWidth: 150 },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  section: { marginTop: spacing.lg },
  sectionHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textMuted, marginBottom: spacing.sm },
  clearButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearButtonText: { ...typography.caption, fontFamily: 'Sora_500Medium', color: colors.cyan },
  list: { gap: spacing.sm },
  rowReveal: { position: 'relative', width: '100%' },
  timelineRow: { paddingLeft: spacing.md },
  signalRail: {
    position: 'absolute',
    left: 2,
    top: 24,
    bottom: -spacing.md,
    width: 1,
    backgroundColor: glass.tintPrimaryStroke,
  },
  signalNode: {
    position: 'absolute',
    top: 18,
    left: -4,
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  historyDivider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  historyRule: { flex: 1, height: 1, backgroundColor: colors.violet },
  rowSeparator: { height: spacing.sm },
  progressText: { ...numericTypography.percent, fontSize: 9, lineHeight: 13, color: colors.cyan },
  jobSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  jobSource: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.4, color: colors.textMuted },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.fillDeep,
  },
  retryButton: { backgroundColor: glass.tintPrimary },
  pressed: { opacity: 0.68 },
  detailPanel: { position: 'relative', marginTop: spacing.xs, padding: spacing.md, paddingLeft: spacing.lg, gap: spacing.sm, borderTopLeftRadius: radii.xs },
  detailAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailGlyph: {
    width: 40,
    height: 40,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
  },
  detailCopy: { flex: 1, minWidth: 0 },
  detailEyebrow: { ...typography.eyebrow, color: colors.cyan },
  detailTitle: { ...typography.subtitle, color: colors.textPrimary, marginTop: 2 },
  detailSource: { ...typography.caption, color: colors.textMuted },
  detailBody: { ...typography.body, color: colors.textSecondary },
  detailAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
