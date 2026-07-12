import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import type { RootStackParamList } from '../navigation/types';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { toast } from '../store/toastStore';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';
import { apiErrorMessage, friendlyJobError, friendlyJobStage } from '../utils/apiError';
import { displayTitle } from '../utils/mediaDisplay';

const STATUS_META: Record<Job['status'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { label: 'Queued', icon: 'time-outline', color: colors.textMuted },
  in_progress: { label: 'In progress', icon: 'sync-outline', color: colors.cyan },
  complete: { label: 'Complete', icon: 'checkmark', color: colors.success },
  failed: { label: 'Needs attention', icon: 'alert', color: colors.danger },
  cancelled: { label: 'Cancelled', icon: 'close', color: colors.textMuted },
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

function JobRow({ job, onCancel, onRetry }: { job: Job; onCancel: () => void; onRetry: () => void }) {
  const meta = STATUS_META[job.status];
  const running = job.status === 'in_progress' || job.status === 'pending';
  const title = jobTitle(job);
  const progress = Math.max(0, Math.min(100, job.progress_pct));
  const detail = job.status === 'failed'
    ? friendlyJobError(job.error_message)
    : `${friendlyJobStage(job.stage_label, meta.label)} · ${timeAgo(job.updated_at)}`;

  return (
    <GlassPanel style={styles.jobCard} edgeColor={running ? 'rgba(99,214,181,0.2)' : undefined}>
      <View style={styles.jobContent}>
        {running ? (
          <ProgressRing progress={progress / 100} size={48} strokeWidth={3.5}>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </ProgressRing>
        ) : (
          <View style={[styles.statusIcon, { backgroundColor: `${meta.color}1F` }]}>
            <Ionicons name={meta.icon} size={19} color={meta.color} />
          </View>
        )}

        <View style={styles.jobCopy}>
          <View style={styles.jobSourceRow}>
            <Ionicons name={sourceIcon(job.source_url)} size={12} color={colors.textMuted} />
            <Text style={styles.jobSource}>{sourceName(job.source_url).replace(' import', '').toUpperCase()}</Text>
          </View>
          <Text numberOfLines={1} style={styles.jobTitle}>{title}</Text>
          <Text numberOfLines={job.status === 'failed' ? 2 : 1} style={[styles.jobDetail, job.status === 'failed' && styles.jobDetailError]}>
            {detail}
          </Text>
        </View>

        {running ? (
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${title}`}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {job.status === 'failed' && job.source_url ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${title}`}
            style={({ pressed }) => [styles.iconButton, styles.retryButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={19} color={colors.cyan} />
          </Pressable>
        ) : null}
      </View>
    </GlassPanel>
  );
}

export function JobsScreen({ embedded = false }: { embedded?: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const upsertMedia = useLibraryStore((state) => state.upsert);

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
    try {
      updateJob(await downloadsApi.cancelDownload(job.id));
      toast('Import cancelled.', 'info');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't cancel this import."), 'error');
    }
  }

  async function handleRetry(job: Job) {
    if (!job.source_url) return;
    try {
      const replacement = await downloadsApi.createDownload(job.source_url, job.result_media?.media_type ?? 'audio');
      updateJob(replacement);
      toast('Import restarted.', 'success');
    } catch (caught) {
      toast(apiErrorMessage(caught, "Couldn't restart this import."), 'error');
    }
  }

  function clearFinished() {
    setJobs((current) => current?.filter((job) => job.status === 'pending' || job.status === 'in_progress') ?? current);
    toast('Finished activity hidden.', 'info');
  }

  function goToday() {
    navigation.navigate('Main', { screen: 'Home' });
  }

  const activityEmpty = jobs !== null && !loadError && jobs.length === 0;

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={760}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, embedded && styles.scrollEmbedded, activityEmpty && styles.scrollEmpty]}
        >
          <View style={styles.headerRow}>
            {!embedded ? (
              <Pressable
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </Pressable>
            ) : null}
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>YOUR IMPORTS</Text>
              <Text style={styles.title}>Activity</Text>
              <Text style={styles.subtitle}>Follow every download from link to library.</Text>
            </View>
            {embedded ? <SidebarTrigger size={40} /> : <View style={styles.headerButtonPlaceholder} />}
          </View>

          {jobs && jobs.length > 0 ? (
            <View style={styles.summaryRow}>
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
            </View>
          ) : null}

          {jobs === null ? (
            <View style={styles.loadingState} accessibilityLabel="Loading activity">
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.loadingText}>Loading activity…</Text>
            </View>
          ) : loadError ? (
            <GlassPanel style={styles.errorPanel}>
              <View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={24} color={colors.danger} /></View>
              <Text style={styles.errorTitle}>Activity is unavailable</Text>
              <Text style={styles.errorBody}>{loadError}</Text>
              <Button label="Try again" variant="ghost" onPress={() => void load()} style={styles.retryLoadButton} />
            </GlassPanel>
          ) : jobs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Nothing in motion"
                subtitle="Imports you start on Today will appear here with live progress."
                icon="pulse-outline"
                actionLabel="Import your first track"
                onAction={goToday}
              />
            </View>
          ) : (
            <>
              {active.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>IN PROGRESS</Text>
                  <View style={styles.list}>
                    {active.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        onCancel={() => void handleCancel(job)}
                        onRetry={() => void handleRetry(job)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {finished.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <Text style={styles.sectionTitle}>HISTORY</Text>
                    <Pressable
                      onPress={clearFinished}
                      accessibilityRole="button"
                      accessibilityLabel="Hide finished activity"
                      style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.clearButtonText}>Hide finished</Text>
                    </Pressable>
                  </View>
                  <View style={styles.list}>
                    {finished.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        onCancel={() => void handleCancel(job)}
                        onRetry={() => void handleRetry(job)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
      {embedded ? <MiniPlayerBar /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050A0B' },
  scroll: { paddingBottom: spacing.xxl },
  scrollEmbedded: { paddingBottom: layout.tabBarClearance },
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
    backgroundColor: 'rgba(17,30,25,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(158,181,170,0.09)',
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...typography.title, fontSize: 20, lineHeight: 25, color: colors.textPrimary },
  summaryValueAttention: { color: colors.danger },
  summaryLabel: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(158,181,170,0.12)' },
  loadingState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
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
  jobCard: { borderRadius: radii.lg },
  jobContent: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  statusIcon: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  progressText: { ...typography.caption, fontSize: 9, fontFamily: 'Sora_600SemiBold', color: colors.cyan },
  jobCopy: { flex: 1, minWidth: 0 },
  jobSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  jobSource: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, letterSpacing: 1.4, color: colors.textMuted },
  jobTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  jobDetail: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  jobDetailError: { color: colors.danger },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,11,0.48)',
  },
  retryButton: { backgroundColor: 'rgba(99,214,181,0.1)' },
  pressed: { opacity: 0.68 },
});
