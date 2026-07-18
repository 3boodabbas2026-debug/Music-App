import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';

import { BrandMark } from '../components/ui/BrandMark';
import { AccountSecurityPanel } from '../components/account/AccountSecurityPanel';
import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { Reveal } from '../components/ui/Reveal';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { TextField } from '../components/ui/TextField';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useResponsive } from '../hooks/useResponsive';
import * as feedbackApi from '../services/api/feedback';
import * as recognitionsApi from '../services/api/recognitions';
import * as telegramApi from '../services/api/telegram';
import type { TelegramStatus } from '../services/api/telegram';
import { watchJob } from '../services/api/jobSocket';
import * as offlineMedia from '../services/storage/offlineMedia';
import type { OfflineEntry } from '../services/storage/offlineMedia';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore } from '../store/dashboardStore';
import { requestSignOut } from '../store/signOutStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { toast } from '../store/toastStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { displayArtist, displayTitle } from '../utils/mediaDisplay';
import { apiErrorMessage } from '../utils/apiError';
import type { RootStackParamList } from '../navigation/types';

function SettingSwitch({
  label,
  hint,
  value,
  onChange,
  compact,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.switchRow, compact && styles.switchRowSmall]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceBorderStrong, true: colors.cyan }}
        thumbColor={value ? colors.textInverse : colors.textSecondary}
      />
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function StatusRow({
  label,
  ok,
  pending,
  notConnectedLabel = 'Unavailable',
  neutralWhenOff = false,
}: {
  label: string;
  ok: boolean | null;
  pending?: boolean;
  /** What to call the "not ok" state — e.g. "Not linked" for optional integrations. */
  notConnectedLabel?: string;
  /** Optional integrations aren't *broken* when off — show muted, not red. */
  neutralWhenOff?: boolean;
}) {
  const state: 'good' | 'bad' | 'unknown' = pending || ok === null ? 'unknown' : ok ? 'good' : 'bad';
  return (
    <View style={styles.statusRow}>
      <View
        style={[
          styles.statusDot,
          state === 'good' && styles.statusDotGood,
          state === 'bad' && !neutralWhenOff && styles.statusDotBad,
        ]}
      />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, state === 'bad' && !neutralWhenOff && styles.statusValueBad]}>
        {state === 'unknown' ? 'Checking…' : state === 'good' ? 'Connected' : notConnectedLabel}
      </Text>
    </View>
  );
}

const STORAGE_OPTIONS: Array<{ value: 'auto' | 'local' | 'cloud'; label: string; hint: string }> = [
  { value: 'auto', label: 'Automatic', hint: "This server's default for new downloads." },
  { value: 'cloud', label: 'Cloud', hint: 'New downloads go to the cloud bucket — survives redeploys.' },
  {
    value: 'local',
    label: 'Server disk',
    hint: 'New downloads stay on this server’s disk — cleared on redeploy on free hosting tiers, not recommended unless you know this server has persistent storage.',
  },
];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useResponsive();
  const smallPhone = width < 390;
  const { preference, setPreference } = useTheme();
  const dashboardAccent = useDashboardStore((state) => state.accent);
  const setDashboardAccent = useDashboardStore((state) => state.setAccent);
  const user = useAuthStore((s) => s.user);
  const setStoragePreference = useAuthStore((s) => s.setStoragePreference);
  const [savingStoragePref, setSavingStoragePref] = useState(false);

  async function handleStoragePreference(pref: 'auto' | 'local' | 'cloud') {
    if (savingStoragePref || pref === (user?.storage_preference ?? 'auto')) return;
    setSavingStoragePref(true);
    try {
      await setStoragePreference(pref);
      toast('Storage preference updated', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't update your storage preference."), 'error');
    } finally {
      setSavingStoragePref(false);
    }
  }
  const items = useLibraryStore((s) => s.items);
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const { networkOnline, backendOnline } = useOnlineStatus();
  const crossfadeEnabled = usePlayerStore((s) => s.crossfadeEnabled);
  const setCrossfadeEnabled = usePlayerStore((s) => s.setCrossfadeEnabled);
  const autoplayContinuation = usePlayerStore((s) => s.autoplayContinuation);
  const setAutoplayContinuation = usePlayerStore((s) => s.setAutoplayContinuation);

  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [offlineEntries, setOfflineEntries] = useState<OfflineEntry[]>([]);
  const [clearing, setClearing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [namingProgress, setNamingProgress] = useState<{ named: number; processed: number; total: number } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  async function handleSendFeedback() {
    const message = feedbackMessage.trim();
    if (!message || sendingFeedback) return;
    setSendingFeedback(true);
    try {
      await feedbackApi.submitFeedback(message);
      setFeedbackMessage('');
      toast('Thanks — sent to the team', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't send that right now."), 'error');
    } finally {
      setSendingFeedback(false);
    }
  }

  async function nameLibrary() {
    if (naming) return;
    setNaming(true);
    setNamingProgress(null);
    try {
      const job = await recognitionsApi.recognizeWholeLibrary();
      const initialTotal = job.batch_total ?? 0;
      if (job.status === 'complete' && initialTotal === 0) {
        toast('Every track already has a name', 'success');
        setNaming(false);
        return;
      }
      setNamingProgress({ named: job.batch_matched ?? 0, processed: job.batch_processed ?? 0, total: initialTotal });
      toast(`Naming ${initialTotal} track${initialTotal === 1 ? '' : 's'}…`, 'info');
      const unsubscribe = watchJob(job.id, (update) => {
        const total = update.batch_total ?? initialTotal;
        const named = update.batch_matched ?? 0;
        const processed = update.batch_processed ?? 0;
        setNamingProgress({ named, processed, total });
        if (update.result_media) upsertMedia(update.result_media);

        if (update.status === 'complete' || update.status === 'failed' || update.status === 'cancelled') {
          unsubscribe();
          setNaming(false);
          setNamingProgress(null);
          void refreshLibrary();
          if (update.status === 'complete') {
            toast(`Named ${named} of ${total} tracks`, named > 0 ? 'success' : 'info');
          } else {
            toast(update.error_message ?? `Naming stopped after checking ${processed} of ${total} tracks`, 'error');
          }
        }
      });
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't start library naming."), 'error');
      setNaming(false);
      setNamingProgress(null);
    }
  }

  async function exportLibrary() {
    const payload = JSON.stringify(
      items.map((m) => ({
        title: displayTitle(m),
        artist: displayArtist(m),
        album: m.album,
        type: m.media_type,
        source: m.source,
        source_url: m.source_url,
        duration_seconds: m.duration_seconds,
        added: m.created_at,
      })),
      null,
      2,
    );
    if (Platform.OS === 'web') {
      const blob = new Blob([payload], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = 'starhollow-library.json';
      anchor.click();
      URL.revokeObjectURL(href);
      toast('Library exported', 'success');
    } else {
      await Clipboard.setStringAsync(payload);
      toast('Library JSON copied to clipboard', 'success');
    }
  }

  useEffect(() => {
    telegramApi.getStatus().then(setTelegramStatus).catch(() => setTelegramStatus(null));
  }, []);

  const refreshOffline = () => {
    offlineMedia.listOffline().then(setOfflineEntries);
  };
  useEffect(refreshOffline, []);

  const offlineSupported = offlineMedia.isSupported();
  const offlineBytes = offlineEntries.reduce((sum, e) => sum + e.sizeBytes, 0);

  async function handleClearOffline() {
    setClearing(true);
    try {
      await offlineMedia.clearAll();
      setOfflineEntries([]);
      toast('Offline downloads cleared', 'success');
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't clear offline downloads."), 'error');
    } finally {
      setClearing(false);
    }
  }

  const audioCount = items.filter((m) => m.media_type === 'audio').length;
  const videoCount = items.length - audioCount;

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={720}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, smallPhone && styles.scrollSmall]}
        >
          <Reveal>
            <View style={[styles.headerRow, smallPhone && styles.headerRowSmall]}>
              <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
              <SectionHeader
                eyebrow="Preferences"
                title="Settings"
                subtitle="Shape playback, storage, and the way Starhollow works for you."
                style={styles.screenHeading}
              />
            </View>
          </Reveal>

          <Reveal delay={30} distance={8}>
            <SectionHeader title="Appearance" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
            <GlassPanel style={styles.panel}>
              <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
                <View style={styles.appearanceControl}>
                  <Text style={styles.fieldLabel}>App theme</Text>
                  <Text style={styles.hint}>Follow this device, brighten the hollow for daylight, or keep the night sky always on.</Text>
                  <SegmentedControl
                    options={[
                      { value: 'system', label: 'System', icon: 'contrast-outline' },
                      { value: 'light', label: 'Daylight', icon: 'sunny-outline' },
                      { value: 'dark', label: 'Night', icon: 'moon-outline' },
                    ]}
                    value={preference}
                    onChange={setPreference}
                    accessibilityLabel="App appearance"
                  />
                </View>
                <View style={styles.appearanceControl}>
                  <Text style={styles.fieldLabel}>Dashboard accent</Text>
                  <Text style={styles.hint}>Choose the forest glow or a quieter cosmic highlight for Today.</Text>
                  <SegmentedControl
                    options={[
                      { value: 'forest', label: 'Forest', icon: 'leaf-outline', tintColor: colors.cyan },
                      { value: 'cosmic', label: 'Cosmic', icon: 'planet-outline', tintColor: colors.violet },
                    ]}
                    value={dashboardAccent}
                    onChange={setDashboardAccent}
                    accessibilityLabel="Dashboard accent"
                  />
                </View>
              </View>
            </GlassPanel>
          </Reveal>

          <Reveal delay={40} distance={8}>
            <SectionHeader title="Connection" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
            <GlassPanel style={styles.panel}>
              <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
                <StatusRow label="Network" ok={networkOnline} />
                <StatusRow label="Starhollow API" ok={backendOnline} pending={backendOnline === null} />
                <StatusRow
                  label="Telegram"
                  ok={telegramStatus ? telegramStatus.authorized : null}
                  pending={telegramStatus === null}
                  notConnectedLabel="Not linked yet"
                  neutralWhenOff
                />
                <Button
                  label={telegramStatus?.authorized ? 'Manage Telegram import' : 'Connect Telegram'}
                  variant="secondary"
                  onPress={() => navigation.navigate('Telegram')}
                  style={styles.inlineButton}
                />
              </View>
            </GlassPanel>
          </Reveal>

          <Reveal delay={80} distance={8}>
            <SectionHeader title="Account" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
            <GlassPanel style={styles.panel}>
              <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
                <AccountSecurityPanel />
              </View>
            </GlassPanel>
          </Reveal>

          <Reveal delay={120} distance={8}>
            <SectionHeader title="Playback" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
            <GlassPanel style={styles.panel}>
              <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
                <SettingSwitch
                  label="Smooth transitions"
                  hint="Blend the end of one track into the start of the next instead of a hard cut."
                  value={crossfadeEnabled}
                  onChange={setCrossfadeEnabled}
                  compact={smallPhone}
                />
                <SettingSwitch
                  label="Keep the music going"
                  hint="When your queue runs out, keep playing from your library instead of stopping."
                  value={autoplayContinuation}
                  onChange={setAutoplayContinuation}
                  compact={smallPhone}
                />
              </View>
            </GlassPanel>
          </Reveal>

          <SectionHeader title="Library & storage" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
          <GlassPanel style={styles.panel}>
            <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
              <View style={[styles.fieldRow, smallPhone && styles.fieldRowSmall]}>
                <Text style={styles.fieldLabel}>In your archive</Text>
                <Text style={[styles.fieldValue, smallPhone && styles.fieldValueSmall]}>
                  {items.length} tracks · {audioCount} audio · {videoCount} video
                </Text>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text style={styles.fieldLabel}>Where new downloads are stored</Text>
                <SegmentedControl
                  accessibilityLabel="Where new downloads are stored"
                  value={user?.storage_preference ?? 'auto'}
                  onValueChange={handleStoragePreference}
                  options={STORAGE_OPTIONS.filter(
                    (option) => option.value !== 'cloud' || user?.cloud_storage_available,
                  ).map((option) => ({ ...option, disabled: savingStoragePref }))}
                  style={savingStoragePref ? styles.controlBusy : undefined}
                />
                <Text style={styles.hint}>
                  {STORAGE_OPTIONS.find((o) => o.value === (user?.storage_preference ?? 'auto'))?.hint}
                  {' '}Only affects new imports/downloads — your existing library stays where it already is.
                </Text>
              </View>

              {offlineSupported ? (
                <>
                  <View style={[styles.fieldRow, smallPhone && styles.fieldRowSmall]}>
                    <Text style={styles.fieldLabel}>Saved offline</Text>
                    <Text style={[styles.fieldValue, smallPhone && styles.fieldValueSmall]}>
                      {offlineEntries.length} tracks · {formatBytes(offlineBytes)}
                    </Text>
                  </View>
                  {offlineEntries.length > 0 && (
                    <Button
                      label={clearing ? 'Clearing…' : 'Remove all offline downloads'}
                      variant="danger"
                      loading={clearing}
                      onPress={handleClearOffline}
                      style={styles.inlineButton}
                    />
                  )}
                  <Text style={styles.hint}>
                    Offline saves live only on this device and browser profile. Signing out clears them
                    immediately so they can't be seen by the next person who signs in here.
                  </Text>
                </>
              ) : (
                <Text style={styles.hint}>
                  Offline downloads aren't available in this build ({Platform.OS}) — they're a web/PWA-only
                  feature for now.
                </Text>
              )}
            </View>
          </GlassPanel>

          <SectionHeader title="Library tools" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
          <GlassPanel style={styles.panel}>
            <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
              <Button
                label={
                  namingProgress
                    ? `Named ${namingProgress.named} of ${namingProgress.total} · checked ${namingProgress.processed}`
                    : naming
                      ? 'Preparing your tracks…'
                      : 'Name untitled tracks'
                }
                icon="sparkles-outline"
                variant="secondary"
                disabled={naming}
                loading={naming}
                onPress={nameLibrary}
              />
              <Button label="Export library as JSON" icon="download-outline" variant="ghost" onPress={exportLibrary} />
            </View>
          </GlassPanel>

          <SectionHeader title="Feedback" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
          <GlassPanel style={styles.panel}>
            <View style={[styles.panelBody, smallPhone && styles.panelBodySmall]}>
              <Text style={styles.hint}>Found a bug, or want something changed? Tell us directly.</Text>
              <TextField
                label="Message"
                value={feedbackMessage}
                onChangeText={setFeedbackMessage}
                placeholder="What's on your mind?"
                multiline
                style={styles.feedbackInput}
              />
              <Button
                label={sendingFeedback ? 'Sending…' : 'Send feedback'}
                variant="secondary"
                loading={sendingFeedback}
                disabled={!feedbackMessage.trim()}
                onPress={handleSendFeedback}
                style={styles.inlineButton}
              />
            </View>
          </GlassPanel>

          <SectionHeader title="About" style={styles.sectionHeader} titleStyle={styles.sectionHeading} />
          <GlassPanel style={styles.panel}>
            <View style={[styles.panelBody, smallPhone && styles.panelBodySmall, styles.aboutRow]}>
              <BrandMark size={28} />
              <View>
                <Text style={styles.fieldValue}>Starhollow</Text>
                <Text style={styles.hint}>Your private signal archive.</Text>
              </View>
            </View>
          </GlassPanel>

          <Button
            label="Sign out"
            variant="danger"
            onPress={() => void requestSignOut()}
            style={styles.signOutButton}
          />
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingBottom: spacing.xxl },
  scrollSmall: { paddingBottom: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  headerRowSmall: { gap: spacing.sm, marginBottom: spacing.lg },
  screenHeading: { flex: 1 },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeading: { ...typography.title, fontSize: 17, lineHeight: 23, color: colors.textPrimary },
  panel: { borderRadius: radii.lg },
  panelBody: { padding: spacing.lg, gap: spacing.md },
  appearanceControl: { gap: spacing.sm },
  panelBodySmall: { padding: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.textMuted },
  statusDotGood: { backgroundColor: colors.success },
  statusDotBad: { backgroundColor: colors.danger },
  statusLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  statusValue: { ...typography.caption, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
  statusValueBad: { color: colors.danger },
  inlineButton: { marginTop: spacing.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fieldRowSmall: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchRowSmall: { alignItems: 'flex-start', gap: spacing.sm },
  fieldLabel: { ...typography.body, color: colors.textMuted },
  controlBusy: { opacity: 0.5 },
  feedbackInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  fieldValue: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, textAlign: 'right', flexShrink: 1 },
  fieldValueSmall: { alignSelf: 'stretch', textAlign: 'left' },
  hint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signOutButton: { marginTop: spacing.xl },
});
