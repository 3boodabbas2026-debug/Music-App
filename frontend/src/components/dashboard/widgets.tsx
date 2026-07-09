import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { EmptyState } from '../ui/EmptyState';
import { FadeImage } from '../ui/FadeImage';
import { GlassPanel } from '../ui/GlassPanel';
import { CoverBackdrop } from '../player/CoverBackdrop';
import { ProgressBar } from '../ui/ProgressBar';
import { ProgressRing } from '../ui/ProgressRing';
import { PressableScale } from '../ui/PressableScale';
import { navigationRef } from '../../navigation/navigationRef';
import * as telegramApi from '../../services/api/telegram';
import type { Job, Media } from '../../services/api/types';
import * as offlineMedia from '../../services/storage/offlineMedia';
import { useFavoritesStore } from '../../store/favoritesStore';
import type { Density } from '../../store/dashboardStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePinStore } from '../../store/pinStore';
import { usePlayerStore } from '../../store/playerStore';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { colors, gradients, radii, spacing, typography } from '../../theme/tokens';
import { WIDGET_LABELS, type WidgetId } from '../../store/dashboardStore';

function WidgetShell({ id, density, children }: { id: WidgetId; density: Density; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: density === 'compact' ? spacing.md : spacing.lg }}>
      <Text style={[styles.widgetTitle, density === 'compact' && styles.widgetTitleCompact]}>
        {WIDGET_LABELS[id].title}
      </Text>
      {children}
    </View>
  );
}

function sourceIcon(url: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'link';
  if (url.startsWith('telegram:')) return 'paper-plane';
  if (/youtu\.?be/i.test(url)) return 'logo-youtube';
  if (/tiktok/i.test(url)) return 'logo-tiktok';
  if (/instagram/i.test(url)) return 'logo-instagram';
  return 'link';
}

// ---------- Continue listening ----------
export function ContinueListeningWidget({ density, accentColor = colors.cyan }: { density: Density; accentColor?: string }) {
  const currentMedia = usePlayerStore((s) => s.currentMedia);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const restored = usePlayerStore((s) => s.restored);

  return (
    <WidgetShell id="continueListening" density={density}>
      {!currentMedia ? (
        <GlassPanel style={styles.panelCompact}>
          <Text style={styles.mutedLine}>Nothing played yet — start a track and it'll pick up right here.</Text>
        </GlassPanel>
      ) : (
        <PressableScale onPress={() => navigationRef.isReady() && navigationRef.navigate('Player')} scaleTo={0.99}>
          <View style={styles.continueHero}>
            {currentMedia.thumbnail_url && (
              <CoverBackdrop uri={currentMedia.thumbnail_url} opacity={0.9} blurRadius={25} scrimOpacity={0.4} />
            )}
            <GlassPanel style={styles.panelCompact} overlayColor="rgba(18,28,24,0.32)">
              <View style={styles.continueRow}>
                <View style={styles.continueCover}>
                  {currentMedia.thumbnail_url ? (
                    <FadeImage uri={currentMedia.thumbnail_url} style={StyleSheet.absoluteFill as object} />
                  ) : (
                    <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={1} style={styles.continueTitle}>
                    {currentMedia.title ?? currentMedia.recognized_title ?? 'Untitled'}
                  </Text>
                  <Text numberOfLines={1} style={styles.mutedLine}>
                    {currentMedia.artist ?? currentMedia.recognized_artist ?? 'Unknown artist'} · {restored ? 'Paused' : 'Playing'}
                  </Text>
                  <ProgressBar progress={duration > 0 ? currentTime / duration : 0} />
                </View>
                <Ionicons name={restored ? 'play' : 'pause'} size={20} color={accentColor} />
              </View>
            </GlassPanel>
          </View>
        </PressableScale>
      )}
    </WidgetShell>
  );
}

// ---------- Download queue ----------
export function QueueWidget({
  density,
  jobs,
  onCancel,
  onRetry,
  onClearFinished,
}: {
  density: Density;
  jobs: Job[];
  onCancel: (job: Job) => void;
  onRetry: (job: Job) => void;
  onClearFinished: () => void;
}) {
  if (jobs.length === 0) return null;
  const hasFinished = jobs.some((j) => j.status !== 'pending' && j.status !== 'in_progress');
  return (
    <View style={{ marginBottom: density === 'compact' ? spacing.md : spacing.lg }}>
      <View style={styles.sectionRow}>
        <Text style={[styles.widgetTitle, density === 'compact' && styles.widgetTitleCompact]}>
          {WIDGET_LABELS.queue.title}
        </Text>
        {hasFinished && (
          <Pressable onPress={onClearFinished} hitSlop={8}>
            <Text style={styles.sectionAction}>Clear finished</Text>
          </Pressable>
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {jobs.map((job) => {
          const label = job.result_media?.title ?? job.source_url ?? 'Download';
          const running = job.status === 'in_progress' || job.status === 'pending';
          return (
            <GlassPanel key={job.id} style={styles.panelRow}>
              <View style={styles.jobContent}>
                {running ? (
                  <ProgressRing progress={job.progress_pct / 100} size={40} strokeWidth={3.5}>
                    <Text style={styles.jobPct}>{Math.round(job.progress_pct)}</Text>
                  </ProgressRing>
                ) : (
                  <View style={[styles.jobBadge, job.status === 'failed' && styles.jobBadgeFailed]}>
                    <Ionicons
                      name={job.status === 'complete' ? 'checkmark' : job.status === 'failed' ? 'close' : 'remove'}
                      size={18}
                      color={job.status === 'failed' ? colors.danger : colors.success}
                    />
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.titleRow}>
                    <Ionicons name={sourceIcon(job.source_url)} size={12} color={colors.textMuted} />
                    <Text numberOfLines={1} style={styles.jobTitle}>{label}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.mutedLine, job.status === 'failed' && { color: colors.danger }]}>
                    {job.status === 'failed' ? job.error_message ?? 'Failed' : job.stage_label ?? job.status}
                  </Text>
                </View>
                {running && (
                  <Pressable onPress={() => onCancel(job)} hitSlop={8} style={styles.iconButton}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
                {job.status === 'failed' && job.source_url && (
                  <Pressable onPress={() => onRetry(job)} hitSlop={8} style={styles.iconButton}>
                    <Ionicons name="refresh" size={16} color={colors.cyan} />
                  </Pressable>
                )}
              </View>
            </GlassPanel>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Recent downloads ----------
export function RecentDownloadsWidget({
  density,
  items,
  coverSize,
  onPlay,
}: {
  density: Density;
  items: Media[];
  coverSize: number;
  onPlay: (media: Media) => void;
}) {
  return (
    <WidgetShell id="recent" density={density}>
      {items.length === 0 ? (
        <EmptyState title="Nothing here yet" subtitle="Your latest downloads will land here." icon="cloud-download-outline" />
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
          renderItem={({ item }) => <CoverCard media={item} size={coverSize} onPress={() => onPlay(item)} />}
        />
      )}
    </WidgetShell>
  );
}

export const CoverCard = memo(function CoverCard({ media, size, onPress }: { media: Media; size: number; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95}>
      <View style={[styles.coverCard, { width: size, height: size }]}>
        {media.thumbnail_url ? (
          <FadeImage uri={media.thumbnail_url} style={StyleSheet.absoluteFill as object} />
        ) : (
          <LinearGradient colors={gradients.coverFallback} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={gradients.coverScrim} style={styles.coverScrim} />
        {!media.thumbnail_url && (
          <View style={styles.coverGlyphWrap}>
            <Ionicons name={media.media_type === 'video' ? 'videocam' : 'musical-notes'} size={34} color="rgba(231,235,230,0.35)" />
          </View>
        )}
        <View style={styles.coverMeta}>
          <Text numberOfLines={1} style={styles.coverTitle}>
            {media.title ?? media.recognized_title ?? 'Untitled'}
          </Text>
          <Text numberOfLines={1} style={styles.mutedLine}>
            {media.artist ?? media.recognized_artist ?? 'Unknown artist'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ---------- Favorites ----------
export function FavoritesWidget({ density, coverSize, onPlay }: { density: Density; coverSize: number; onPlay: (m: Media) => void }) {
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const items = useLibraryStore((s) => s.items);
  const favorites = items.filter((m) => favoriteIds[m.id]);

  return (
    <WidgetShell id="favorites" density={density}>
      {favorites.length === 0 ? (
        <GlassPanel style={styles.panelCompact}>
          <Text style={styles.mutedLine}>Star a track from your library and it'll show up here.</Text>
        </GlassPanel>
      ) : (
        <FlatList
          horizontal
          data={favorites}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
          renderItem={({ item }) => <CoverCard media={item} size={coverSize} onPress={() => onPlay(item)} />}
        />
      )}
    </WidgetShell>
  );
}

// ---------- Pinned ----------
export function PinnedWidget({ density, coverSize, onPlay }: { density: Density; coverSize: number; onPlay: (m: Media) => void }) {
  const pinnedIds = usePinStore((s) => s.ids);
  const items = useLibraryStore((s) => s.items);
  const pinned = pinnedIds.map((id) => items.find((m) => m.id === id)).filter((m): m is Media => !!m);

  if (pinned.length === 0) return null;

  return (
    <WidgetShell id="pinned" density={density}>
      <FlatList
        horizontal
        data={pinned}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        renderItem={({ item }) => <CoverCard media={item} size={coverSize} onPress={() => onPlay(item)} />}
      />
    </WidgetShell>
  );
}

// ---------- On repeat ----------
export function OnRepeatWidget({ density, coverSize, onPlay }: { density: Density; coverSize: number; onPlay: (m: Media) => void }) {
  const items = useLibraryStore((s) => s.items);
  const events = usePlayHistoryStore((s) => s.events);
  const topInWindow = usePlayHistoryStore((s) => s.topInWindow);
  const top = topInWindow(30, 10);
  const onRepeat = top.map((event) => items.find((m) => m.id === event.mediaId)).filter((m): m is Media => !!m);

  if (onRepeat.length === 0) return null;
  void events; // subscribed so this widget re-renders as new plays are recorded

  return (
    <View style={{ marginBottom: density === 'compact' ? spacing.md : spacing.lg }}>
      <View style={styles.sectionRow}>
        <Text style={[styles.widgetTitle, density === 'compact' && styles.widgetTitleCompact]}>
          {WIDGET_LABELS.onRepeat.title}
        </Text>
        <Pressable onPress={() => navigationRef.isReady() && navigationRef.navigate('Replay')} hitSlop={8}>
          <Text style={styles.sectionAction}>Your Replay</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={onRepeat}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        renderItem={({ item }) => <CoverCard media={item} size={coverSize} onPress={() => onPlay(item)} />}
      />
    </View>
  );
}

// ---------- Library stats ----------
export function StatsWidget({ density, accentColor = colors.cyan }: { density: Density; accentColor?: string }) {
  const items = useLibraryStore((s) => s.items);
  if (items.length === 0) return null;
  const audioCount = items.filter((m) => m.media_type === 'audio').length;
  const videoCount = items.length - audioCount;
  const namedCount = items.filter((m) => m.recognized_title || m.recognized_artist).length;

  return (
    <WidgetShell id="stats" density={density}>
      <View style={styles.statsRow}>
        <StatTile icon="albums-outline" value={items.length} label="in the archive" accentColor={accentColor} />
        <StatTile icon="musical-notes-outline" value={audioCount} label="audio tracks" accentColor={accentColor} />
        <StatTile icon="videocam-outline" value={videoCount} label="videos" accentColor={accentColor} />
        <StatTile icon="sparkles-outline" value={namedCount} label="auto-named" accentColor={accentColor} />
      </View>
    </WidgetShell>
  );
}

function StatTile({
  icon,
  value,
  label,
  accentColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  accentColor: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}33` }]}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.mutedLine}>{label}</Text>
      </View>
    </View>
  );
}

// ---------- Telegram connection ----------
export function TelegramWidget({ density }: { density: Density }) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');

  useEffect(() => {
    telegramApi
      .getStatus()
      .then((s) => setStatus(s.authorized ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected'));
  }, []);

  return (
    <WidgetShell id="telegram" density={density}>
      <Pressable onPress={() => navigationRef.isReady() && navigationRef.navigate('Telegram')}>
        <GlassPanel style={styles.panelCompact}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, status === 'connected' && styles.statusDotGood]} />
            <Text style={styles.mutedLine}>
              {status === 'loading' ? 'Checking Telegram…' : status === 'connected' ? 'Telegram connected' : 'Telegram not connected'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </GlassPanel>
      </Pressable>
    </WidgetShell>
  );
}

// ---------- Offline availability ----------
export function OfflineWidget({ density }: { density: Density }) {
  const { networkOnline, backendOnline } = useOnlineStatus();
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    offlineMedia.listOffline().then((entries) => setOfflineCount(entries.length));
  }, []);

  const offline = !networkOnline || backendOnline === false;

  return (
    <WidgetShell id="offline" density={density}>
      <GlassPanel style={styles.panelCompact}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, !offline && styles.statusDotGood]} />
          <Text style={styles.mutedLine}>
            {offline ? 'Offline — showing cached data' : 'Online'} · {offlineCount} track{offlineCount === 1 ? '' : 's'} saved for offline
          </Text>
        </View>
      </GlassPanel>
    </WidgetShell>
  );
}

// ---------- Quick actions ----------
export function QuickActionsWidget({ density, accentColor = colors.cyan }: { density: Density; accentColor?: string }) {
  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; go: () => void }[] = [
    { icon: 'mic-outline', label: 'Scan a song', go: () => navigationRef.isReady() && navigationRef.navigate('Main', { screen: 'Recognize' }) },
    { icon: 'paper-plane-outline', label: 'Telegram import', go: () => navigationRef.isReady() && navigationRef.navigate('Telegram') },
    { icon: 'download-outline', label: 'Downloads', go: () => navigationRef.isReady() && navigationRef.navigate('Jobs') },
    { icon: 'settings-outline', label: 'Settings', go: () => navigationRef.isReady() && navigationRef.navigate('Settings') },
  ];

  return (
    <WidgetShell id="quickActions" density={density}>
      <View style={styles.quickRow}>
        {actions.map((action) => (
          <Pressable key={action.label} onPress={action.go} style={styles.quickTile}>
            <Ionicons name={action.icon} size={18} color={accentColor} />
            <Text style={styles.quickLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </WidgetShell>
  );
}

const styles = StyleSheet.create({
  widgetTitle: { ...typography.title, fontSize: 18, lineHeight: 24, color: colors.textPrimary, marginBottom: spacing.sm },
  widgetTitleCompact: { fontSize: 15, lineHeight: 20, marginBottom: spacing.xs },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionAction: { ...typography.caption, color: colors.cyan },
  mutedLine: { ...typography.caption, color: colors.textMuted },
  panelCompact: { borderRadius: radii.lg, padding: spacing.md },
  continueHero: { borderRadius: radii.lg, overflow: 'hidden' },
  panelRow: { borderRadius: radii.lg },
  continueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  continueCover: { width: 48, height: 48, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surface },
  continueTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  jobContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  jobTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary, flex: 1 },
  jobPct: { ...typography.caption, fontSize: 10, color: colors.cyan, fontFamily: 'SpaceGrotesk_600SemiBold' },
  jobBadge: { width: 40, height: 40, borderRadius: radii.pill, backgroundColor: 'rgba(95,191,142,0.12)', alignItems: 'center', justifyContent: 'center' },
  jobBadgeFailed: { backgroundColor: 'rgba(224,104,95,0.12)' },
  iconButton: { width: 32, height: 32, borderRadius: radii.pill, backgroundColor: 'rgba(5,8,5,0.5)', alignItems: 'center', justifyContent: 'center' },
  coverCard: { borderRadius: radii.lg, overflow: 'hidden', justifyContent: 'flex-end', borderWidth: 1, borderColor: 'rgba(167,176,168,0.12)' },
  coverScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  coverGlyphWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coverMeta: { padding: spacing.sm + 2 },
  coverTitle: { ...typography.subtitle, fontSize: 14, lineHeight: 18, color: colors.textPrimary },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statTile: {
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.12)',
    backgroundColor: 'rgba(18,28,24,0.5)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(47,191,170,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(47,191,170,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { ...typography.title, fontSize: 20, lineHeight: 25, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 7, height: 7, borderRadius: radii.pill, backgroundColor: colors.danger },
  statusDotGood: { backgroundColor: colors.success },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickTile: {
    flexGrow: 1,
    flexBasis: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(167,176,168,0.12)',
    backgroundColor: 'rgba(18,28,24,0.5)',
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
  },
  quickLabel: { ...typography.subtitle, fontSize: 13, color: colors.textPrimary, flexShrink: 1 },
});
