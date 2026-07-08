import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { toast } from '../store/toastStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const STATUS_META: Record<Job['status'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pending: { label: 'Queued', icon: 'time-outline', color: colors.textMuted },
  in_progress: { label: 'Running', icon: 'sync-outline', color: colors.cyan },
  complete: { label: 'Complete', icon: 'checkmark-circle', color: colors.success },
  failed: { label: 'Failed', icon: 'alert-circle', color: colors.danger },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', color: colors.textMuted },
};

function sourceIcon(url: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'link';
  if (url.startsWith('telegram:')) return 'paper-plane';
  if (/youtu\.?be/i.test(url)) return 'logo-youtube';
  if (/tiktok/i.test(url)) return 'logo-tiktok';
  if (/instagram/i.test(url)) return 'logo-instagram';
  return 'link';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function JobRow({ job, onCancel, onRetry }: { job: Job; onCancel: () => void; onRetry: () => void }) {
  const meta = STATUS_META[job.status];
  const running = job.status === 'in_progress' || job.status === 'pending';
  const label = job.result_media?.title ?? job.match_title ?? job.source_url ?? 'Job';

  return (
    <GlassPanel style={styles.row}>
      <View style={styles.rowContent}>
        {running ? (
          <ProgressRing progress={job.progress_pct / 100} size={40} strokeWidth={3.5}>
            <Text style={styles.pct}>{Math.round(job.progress_pct)}</Text>
          </ProgressRing>
        ) : (
          <View style={[styles.badge, { backgroundColor: `${meta.color}1F` }]}>
            <Ionicons name={meta.icon} size={18} color={meta.color} />
          </View>
        )}
        <View style={styles.rowText}>
          <View style={styles.titleRow}>
            <Ionicons name={sourceIcon(job.source_url)} size={12} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.title}>
              {label}
            </Text>
          </View>
          <Text numberOfLines={1} style={[styles.subtitle, job.status === 'failed' && styles.subtitleError]}>
            {job.status === 'failed' && job.error_message
              ? job.error_message
              : `${job.job_type === 'download' ? 'Download' : 'Recognition'} · ${meta.label} · ${timeAgo(job.updated_at)}`}
          </Text>
        </View>
        {running && (
          <Pressable onPress={onCancel} hitSlop={8} style={styles.action}>
            <Ionicons name="close" size={17} color={colors.textMuted} />
          </Pressable>
        )}
        {job.status === 'failed' && job.source_url && (
          <Pressable onPress={onRetry} hitSlop={8} style={styles.action}>
            <Ionicons name="refresh" size={17} color={colors.cyan} />
          </Pressable>
        )}
      </View>
    </GlassPanel>
  );
}

export function JobsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const upsertMedia = useLibraryStore((s) => s.upsert);

  const load = useCallback(() => {
    downloadsApi
      .listDownloads()
      .then((data) => setJobs([...data].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))))
      .catch(() => setJobs([]));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!jobs) return;
    const unsubscribers = jobs
      .filter((j) => j.status === 'pending' || j.status === 'in_progress')
      .map((j) =>
        watchJob(j.id, (update) => {
          setJobs((prev) => (prev ? prev.map((job) => (job.id === update.id ? update : job)) : prev));
          if (update.status === 'complete' && update.result_media) upsertMedia(update.result_media);
        }),
      );
    return () => unsubscribers.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs === null]);

  async function handleCancel(job: Job) {
    try {
      const updated = await downloadsApi.cancelDownload(job.id);
      setJobs((prev) => (prev ? prev.map((j) => (j.id === updated.id ? updated : j)) : prev));
    } catch {
      toast("Couldn't cancel that job", 'error');
    }
  }

  async function handleRetry(job: Job) {
    if (!job.source_url) return;
    try {
      await downloadsApi.createDownload(job.source_url, job.result_media?.media_type ?? 'audio');
      toast('Restarted', 'success');
      load();
    } catch {
      toast("Couldn't restart that job", 'error');
    }
  }

  const active = jobs?.filter((j) => j.status === 'pending' || j.status === 'in_progress') ?? [];
  const finished = jobs?.filter((j) => j.status !== 'pending' && j.status !== 'in_progress') ?? [];

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={720}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Activity</Text>
            <View style={{ width: 22 }} />
          </View>

          {jobs === null ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.cyan} />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No activity yet"
              subtitle="Downloads and recognitions you start will show up here."
              icon="pulse-outline"
            />
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>IN PROGRESS</Text>
                  <View style={styles.list}>
                    {active.map((job) => (
                      <JobRow key={job.id} job={job} onCancel={() => handleCancel(job)} onRetry={() => handleRetry(job)} />
                    ))}
                  </View>
                </>
              )}
              {finished.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>HISTORY</Text>
                  <View style={styles.list}>
                    {finished.map((job) => (
                      <JobRow key={job.id} job={job} onCancel={() => handleCancel(job)} onRetry={() => handleRetry(job)} />
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
  root: { flex: 1, backgroundColor: '#060607' },
  scroll: { paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.title, fontSize: 20, color: colors.textPrimary },
  sectionTitle: {
    ...typography.eyebrow,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.sm },
  row: { borderRadius: radii.lg },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  badge: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  pct: { ...typography.caption, fontSize: 10, color: colors.cyan, fontFamily: 'SpaceGrotesk_600SemiBold' },
  rowText: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, flex: 1 },
  subtitle: { ...typography.caption, color: colors.textMuted },
  subtitleError: { color: colors.danger },
  action: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(6,6,7,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
