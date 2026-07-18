import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GlassPanel } from '../components/ui/GlassPanel';
import { IconButton } from '../components/ui/IconButton';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { TextField } from '../components/ui/TextField';
import * as telegramApi from '../services/api/telegram';
import { watchJob } from '../services/api/jobSocket';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { toast } from '../store/toastStore';
import { apiErrorMessage, friendlyJobError, friendlyJobStage } from '../utils/apiError';
import { colors, numericTypography, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Telegram'>;

type LinkPhase = 'loading' | 'setup' | 'code' | 'password' | 'linked';

const LIMITS: Array<{ label: string; value: number | null }> = [
  { label: '25', value: 25 },
  { label: '100', value: 100 },
  { label: '500', value: 500 },
  { label: '2,000', value: 2000 },
  { label: 'All', value: null },
];

const CORRIDOR_STEPS = ['Setup', 'Code', 'Secure', 'Sources', 'Import'] as const;

function StepCorridor({ activeStep }: { activeStep: number }) {
  return (
    <View style={styles.corridor} accessibilityLabel={`Telegram setup step ${activeStep + 1} of ${CORRIDOR_STEPS.length}`}>
      {CORRIDOR_STEPS.map((label, index) => {
        const complete = index < activeStep;
        const active = index === activeStep;
        return (
          <View key={label} style={styles.corridorStep}>
            {index < CORRIDOR_STEPS.length - 1 ? (
              <View style={[styles.corridorLine, (complete || active) && styles.corridorLineLit]} />
            ) : null}
            <View style={[styles.corridorMarker, complete && styles.corridorMarkerComplete, active && styles.corridorMarkerActive]}>
              {complete ? (
                <Ionicons name="checkmark" size={13} color={colors.textInverse} />
              ) : (
                <Text style={[styles.corridorNumber, active && styles.corridorNumberActive]}>{index + 1}</Text>
              )}
            </View>
            <Text numberOfLines={1} style={[styles.corridorLabel, active && styles.corridorLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function TelegramScreen({ navigation }: Props) {
  const refreshLibrary = useLibraryStore((s) => s.refresh);

  const [phase, setPhase] = useState<LinkPhase>('loading');
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedSettings, setHasSavedSettings] = useState(false);
  const [disconnectArmed, setDisconnectArmed] = useState(false);

  const [pickerTab, setPickerTab] = useState<'chats' | 'folders'>('chats');
  const [dialogs, setDialogs] = useState<telegramApi.TelegramDialog[] | null>(null);
  const [dialogQuery, setDialogQuery] = useState('');
  const [visibleDialogCount, setVisibleDialogCount] = useState(30);
  const [selectedChats, setSelectedChats] = useState<Record<string, telegramApi.TelegramDialog>>({});
  const [folders, setFolders] = useState<telegramApi.TelegramFolder[] | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<telegramApi.TelegramFolder | null>(null);
  const [mediaKind, setMediaKind] = useState<'music' | 'video'>('music');
  const [limit, setLimit] = useState<number | null>(25);
  const [importJob, setImportJob] = useState<Job | null>(null);
  const [importStarting, setImportStarting] = useState(false);
  const unsubscribeImport = useRef<(() => void) | null>(null);

  function toggleChat(dialog: telegramApi.TelegramDialog) {
    setSelectedFolder(null);
    setSelectedChats((prev) => {
      const next = { ...prev };
      if (next[dialog.id]) delete next[dialog.id];
      else next[dialog.id] = dialog;
      return next;
    });
  }

  function pickFolder(folder: telegramApi.TelegramFolder) {
    setSelectedChats({});
    setSelectedFolder((prev) => (prev?.id === folder.id ? null : folder));
  }

  useEffect(() => {
    let alive = true;
    telegramApi
      .getStatus()
      .then((status) => {
        if (!alive) return;
        if (status.phone) setPhone(status.phone);
        setHasSavedSettings(status.configured);
        setPhase(status.authorized ? 'linked' : 'setup');
      })
      .catch(() => alive && setPhase('setup'));
    return () => {
      alive = false;
      unsubscribeImport.current?.();
    };
  }, []);

  function fail(err: unknown, fallback: string) {
    setError(apiErrorMessage(err, fallback));
  }

  async function handleConnect() {
    setError(null);
    const numericApiId = Number(apiId.trim());
    if (!Number.isInteger(numericApiId) || numericApiId <= 0) {
      setError('API ID must be a positive number from my.telegram.org.');
      return;
    }
    setBusy(true);
    try {
      await telegramApi.saveSettings(numericApiId, apiHash.trim(), phone.trim());
      setHasSavedSettings(true);
      const result = await telegramApi.sendCode();
      if (result.status === 'authorized') setPhase('linked');
      else setPhase('code');
    } catch (err) {
      fail(err, "Couldn't reach Telegram with those keys.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReconnect() {
    setError(null);
    setBusy(true);
    try {
      const result = await telegramApi.sendCode();
      setPhase(result.status === 'authorized' ? 'linked' : 'code');
    } catch (err) {
      fail(err, "Couldn't send a new Telegram login code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!disconnectArmed) {
      setDisconnectArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await telegramApi.disconnect();
      setDialogs(null);
      setFolders(null);
      setSelectedChats({});
      setSelectedFolder(null);
      setImportJob(null);
      setHasSavedSettings(status.configured);
      setPhase('setup');
      setDisconnectArmed(false);
      toast('Telegram disconnected on this device', 'success');
    } catch (err) {
      fail(err, "Couldn't disconnect Telegram.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await telegramApi.verifyCode(code.trim());
      if (result.status === 'authorized') {
        setPhase('linked');
        toast('Telegram linked', 'success');
      } else if (result.status === 'password_required') {
        setPhase('password');
      }
    } catch (err) {
      fail(err, "That code didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPassword() {
    setError(null);
    setBusy(true);
    try {
      await telegramApi.verifyPassword(password);
      setPhase('linked');
      toast('Telegram linked', 'success');
    } catch (err) {
      fail(err, "That password didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDialogs() {
    setError(null);
    setBusy(true);
    try {
      const [dialogList, folderList] = await Promise.all([
        telegramApi.listDialogs(),
        telegramApi.listFolders().catch(() => []),
      ]);
      setDialogs(dialogList);
      setFolders(folderList);
    } catch (err) {
      fail(err, "Couldn't load your chats.");
    } finally {
      setBusy(false);
    }
  }

  const selectedChatList = useMemo(() => Object.values(selectedChats), [selectedChats]);

  async function handleImport() {
    if (importStarting || importing || (!selectedFolder && selectedChatList.length === 0)) return;
    setError(null);
    setImportStarting(true);
    try {
      const target: telegramApi.ImportTarget = selectedFolder
        ? { folderId: selectedFolder.id }
        : { chats: selectedChatList.map((d) => d.username ?? d.id) };
      const job = await telegramApi.startImport(target, mediaKind, limit);
      setImportJob(job);
      unsubscribeImport.current?.();
      unsubscribeImport.current = watchJob(job.id, (update) => {
        setImportJob(update);
        if (update.status === 'complete') {
          toast(friendlyJobStage(update.stage_label, 'Import complete'), 'success');
          refreshLibrary();
        }
        if (update.status === 'failed') {
          toast(friendlyJobError(update.error_message), 'error');
        }
      });
    } catch (err) {
      fail(err, "Couldn't start that import.");
    } finally {
      setImportStarting(false);
    }
  }

  const filteredDialogs = useMemo(() => {
    if (!dialogs) return null;
    const q = dialogQuery.trim().toLowerCase();
    const list = q ? dialogs.filter((d) => d.title.toLowerCase().includes(q)) : dialogs;
    return list.slice(0, visibleDialogCount);
  }, [dialogs, dialogQuery, visibleDialogCount]);

  const matchingDialogCount = useMemo(() => {
    if (!dialogs) return 0;
    const q = dialogQuery.trim().toLowerCase();
    return q ? dialogs.filter((dialog) => dialog.title.toLowerCase().includes(q)).length : dialogs.length;
  }, [dialogs, dialogQuery]);

  useEffect(() => setVisibleDialogCount(30), [dialogQuery]);

  const importing = importJob && (importJob.status === 'pending' || importJob.status === 'in_progress');
  const corridorStep = phase === 'setup'
    ? 0
    : phase === 'code'
      ? 1
      : phase === 'password'
        ? 2
        : importJob || selectedFolder || selectedChatList.length > 0
          ? 4
          : 3;

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={760}>
        <View style={styles.headerRow}>
          <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => navigation.goBack()} variant="surface" />
          <SectionHeader
            eyebrow="Direct intake"
            title="Telegram"
            subtitle="Bring music and video from the conversations you already keep."
            style={styles.headerText}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {phase !== 'loading' ? <StepCorridor activeStep={corridorStep} /> : null}
          {phase === 'loading' ? (
            <View accessibilityLiveRegion="polite" style={styles.loadingState}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.hint}>Checking your Telegram connection…</Text>
            </View>
          ) : null}

          {phase === 'setup' && (
            <GlassPanel style={[styles.panel, styles.activeChapter]}>
              <View style={styles.panelContent}>
                {hasSavedSettings ? (
                  <>
                    <Text style={styles.panelTitle}>Reconnect your saved account</Text>
                    <Text style={styles.hint}>
                      Your API keys are still encrypted on the server. Send a new code to {phone || 'your saved phone number'} without entering them again.
                    </Text>
                    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                    <Button label="Send a new login code" loading={busy} onPress={handleReconnect} />
                    <Button label="Use a different Telegram account" variant="ghost" onPress={() => setHasSavedSettings(false)} />
                  </>
                ) : (
                  <>
                    <Text style={styles.panelTitle}>Link your account</Text>
                    <Text style={styles.hint}>
                      Telegram needs a one-time, free API key. It takes about a minute:
                    </Text>
                    <View style={styles.steps}>
                      <Text style={styles.step}>
                        <Text style={styles.stepNumber}>1.  </Text>
                        Open{' '}
                        <Text accessibilityRole="link" style={styles.stepLink} onPress={() => Linking.openURL('https://my.telegram.org/apps')}>
                          my.telegram.org/apps
                        </Text>{' '}
                        and log in with your Telegram phone number.
                      </Text>
                      <Text style={styles.step}>
                        <Text style={styles.stepNumber}>2.  </Text>
                        Create an app if asked — any name and any platform is fine.
                      </Text>
                      <Text style={styles.step}>
                        <Text style={styles.stepNumber}>3.  </Text>
                        Copy the api_id and api_hash it shows you into the boxes below.
                      </Text>
                    </View>
                    <TextField label="API ID" value={apiId} onChangeText={setApiId} keyboardType="numeric" placeholder="1234567" />
                    <TextField label="API Hash" value={apiHash} onChangeText={setApiHash} autoCapitalize="none" placeholder="a1b2c3…" />
                    <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+90…" />
                    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                    <Button
                      label="Send login code"
                      loading={busy}
                      disabled={!/^\d+$/.test(apiId.trim()) || !apiHash.trim() || !phone.trim()}
                      onPress={handleConnect}
                    />
                  </>
                )}
              </View>
            </GlassPanel>
          )}

          {phase === 'code' && (
            <GlassPanel style={[styles.panel, styles.activeChapter]}>
              <View style={styles.panelContent}>
                <Text style={styles.panelTitle}>Enter the code</Text>
                <Text style={styles.hint}>Telegram sent a login code to {phone}.</Text>
                <TextField label="Code" value={code} onChangeText={setCode} keyboardType="numeric" placeholder="12345" />
                {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                <Button label="Verify" loading={busy} disabled={!code.trim()} onPress={handleVerifyCode} />
              </View>
            </GlassPanel>
          )}

          {phase === 'password' && (
            <GlassPanel style={[styles.panel, styles.activeChapter]}>
              <View style={styles.panelContent}>
                <Text style={styles.panelTitle}>Two-step verification</Text>
                <Text style={styles.hint}>Your account has a 2FA password — enter it to finish linking.</Text>
                <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
                {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                <Button label="Unlock" loading={busy} disabled={!password} onPress={handleVerifyPassword} />
              </View>
            </GlassPanel>
          )}

          {phase === 'linked' && (
            <>
              <GlassPanel style={[styles.panel, styles.activeChapter]}>
                <View style={styles.panelContent}>
                  <View style={styles.linkedRow}>
                    <View style={styles.linkedBadge}>
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.panelTitle}>Linked{phone ? ` · ${phone}` : ''}</Text>
                      <Text style={styles.hint}>Pull music or video straight from any chat into your library.</Text>
                    </View>
                  </View>

                  <Button
                    label={disconnectArmed ? 'Disconnect and revoke session' : 'Disconnect Telegram'}
                    variant="danger"
                    icon={disconnectArmed ? 'warning-outline' : 'unlink-outline'}
                    loading={busy && disconnectArmed}
                    onPress={handleDisconnect}
                    accessibilityHint={disconnectArmed ? 'Tap again to confirm' : 'Requires confirmation'}
                  />

                  {!dialogs ? (
                    <>
                      <Button label="Load my chats" loading={busy} onPress={loadDialogs} />
                      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                    </>
                  ) : (
                    <>
                      <SegmentedControl
                        accessibilityLabel="Telegram source type"
                        value={pickerTab}
                        onValueChange={setPickerTab}
                        options={[
                          { value: 'chats', label: `Chats${selectedChatList.length > 0 ? ` (${selectedChatList.length})` : ''}` },
                          { value: 'folders', label: `Folders${folders?.length ? ` (${folders.length})` : ''}` },
                        ]}
                      />

                      {pickerTab === 'chats' ? (
                        <>
                          <Text style={styles.hint}>Tap to select one or more chats — imports pull from all of them.</Text>
                          <View style={styles.searchCapsule}>
                            <Ionicons name="search" size={15} color={colors.textMuted} />
                            <TextInput
                              accessibilityLabel="Search Telegram chats"
                              value={dialogQuery}
                              onChangeText={setDialogQuery}
                              placeholder="Search chats"
                              placeholderTextColor={colors.textMuted}
                              selectionColor={colors.cyan}
                              style={styles.searchInput}
                            />
                          </View>
                          <View style={styles.dialogList}>
                            {filteredDialogs?.map((dialog) => {
                              const active = Boolean(selectedChats[dialog.id]);
                              return (
                                <Pressable
                                  key={dialog.id}
                                  onPress={() => toggleChat(dialog)}
                                  accessibilityRole="checkbox"
                                  accessibilityLabel={dialog.title}
                                  accessibilityState={{ checked: active }}
                                  style={[styles.dialogRow, active && styles.dialogRowActive]}
                                >
                                  <View style={[styles.sourceMedallion, active && styles.sourceMedallionActive]}>
                                    <Text style={[styles.sourceInitial, active && styles.sourceInitialActive]}>{dialog.title.trim().charAt(0).toUpperCase() || '?'}</Text>
                                  </View>
                                  <Text numberOfLines={1} style={[styles.dialogTitle, active && styles.dialogTitleActive]}>
                                    {dialog.title}
                                  </Text>
                                  {dialog.username ? <Text style={styles.dialogHandle}>@{dialog.username}</Text> : null}
                                  <Ionicons
                                    name={active ? 'checkbox' : 'square-outline'}
                                    size={17}
                                    color={active ? colors.cyan : colors.textMuted}
                                  />
                                </Pressable>
                              );
                            })}
                            {filteredDialogs?.length === 0 ? (
                              <EmptyState compact icon="search-outline" title="No matching chats" subtitle="Try a different name or clear the search." />
                            ) : null}
                            {filteredDialogs && filteredDialogs.length < matchingDialogCount ? (
                              <Pressable
                                onPress={() => setVisibleDialogCount((count) => count + 30)}
                                accessibilityRole="button"
                                accessibilityLabel={`Show more chats, ${matchingDialogCount - filteredDialogs.length} remaining`}
                                style={({ pressed }) => [styles.showMoreButton, pressed && { opacity: 0.72 }]}
                              >
                                <Text style={styles.showMoreLabel}>
                                  Show more · {filteredDialogs.length} of {matchingDialogCount}
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={styles.hint}>Import every chat inside one of your Telegram folders at once.</Text>
                          <View style={styles.dialogList}>
                            {folders?.map((folder) => {
                              const active = selectedFolder?.id === folder.id;
                              return (
                                <Pressable
                                  key={folder.id}
                                  onPress={() => pickFolder(folder)}
                                  accessibilityRole="radio"
                                  accessibilityLabel={`${folder.title}, ${folder.chat_count} chats`}
                                  accessibilityState={{ checked: active }}
                                  style={[styles.dialogRow, active && styles.dialogRowActive]}
                                >
                                  <View style={[styles.folderWell, active && styles.folderWellActive]}>
                                    <Ionicons name={active ? 'folder-open' : 'folder-outline'} size={18} color={active ? colors.cyan : colors.textMuted} />
                                  </View>
                                  <Text numberOfLines={1} style={[styles.dialogTitle, active && styles.dialogTitleActive]}>
                                    {folder.title}
                                  </Text>
                                  <Text style={styles.dialogHandle}>{folder.chat_count} chats</Text>
                                  <Ionicons
                                    name={active ? 'radio-button-on' : 'radio-button-off'}
                                    size={17}
                                    color={active ? colors.cyan : colors.textMuted}
                                  />
                                </Pressable>
                              );
                            })}
                            {folders?.length === 0 ? (
                              <EmptyState compact icon="folder-open-outline" title="No Telegram folders" subtitle="Create a custom folder in Telegram, then reload your chats." />
                            ) : null}
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              </GlassPanel>

              {(selectedFolder || selectedChatList.length > 0) && (
                <GlassPanel style={[styles.panel, styles.importSummary]}>
                  <View style={styles.panelContent}>
                    <View style={styles.importSummaryHeading}>
                      <View style={styles.importSummaryIcon}>
                        <Ionicons name="download-outline" size={18} color={colors.cyan} />
                      </View>
                      <Text style={styles.importSummaryEyebrow}>IMPORT PLAN</Text>
                    </View>
                    <Text style={styles.panelTitle} numberOfLines={1}>
                      {selectedFolder
                        ? `Import folder "${selectedFolder.title}" (${selectedFolder.chat_count} chats)`
                        : selectedChatList.length === 1
                          ? `Import from ${selectedChatList[0].title}`
                          : `Import from ${selectedChatList.length} chats`}
                    </Text>
                    <SegmentedControl
                      accessibilityLabel="Media type to import"
                      value={mediaKind}
                      onValueChange={setMediaKind}
                      options={[
                        { value: 'music', label: 'Music', icon: 'musical-notes' },
                        { value: 'video', label: 'Video', icon: 'videocam' },
                      ]}
                    />
                    <SegmentedControl
                      accessibilityLabel="Maximum files to import"
                      value={limit === null ? 'all' : String(limit)}
                      onValueChange={(next) => setLimit(next === 'all' ? null : Number(next))}
                      options={LIMITS.map(({ label, value }) => ({
                        value: value === null ? 'all' : String(value),
                        label: value === null ? 'All' : label,
                      }))}
                    />
                    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                    {!importing ? <Button label="Start import" loading={importStarting} onPress={handleImport} /> : null}
                  </View>
                </GlassPanel>
              )}

              {importJob && (
                <GlassPanel style={[styles.panel, styles.importJobPanel]}>
                  <View style={[styles.panelContent, styles.jobRow]}>
                    {importing ? (
                      <ProgressRing progress={importJob.progress_pct / 100} size={48} strokeWidth={4}>
                        <Text style={styles.jobPct}>{Math.round(importJob.progress_pct)}</Text>
                      </ProgressRing>
                    ) : (
                      <View style={[styles.linkedBadge, importJob.status === 'failed' && styles.failedBadge]}>
                        <Ionicons
                          name={importJob.status === 'complete' ? 'checkmark' : 'close'}
                          size={16}
                          color={importJob.status === 'failed' ? colors.danger : colors.success}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.panelTitle}>
                        {importJob.source_url?.replace('telegram:', '') ?? 'Import'}
                      </Text>
                      <Text numberOfLines={2} style={styles.hint}>
                        {importJob.status === 'failed'
                          ? friendlyJobError(importJob.error_message)
                          : `${friendlyJobStage(importJob.stage_label, importJob.status)}${importing ? '…' : ''}`}
                      </Text>
                    </View>
                    {importing && <ActivityIndicator size="small" color={colors.cyan} />}
                  </View>
                </GlassPanel>
              )}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xl },
  headerText: { flex: 1 },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxl },
  corridor: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceBright,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  corridorStep: { position: 'relative', flex: 1, alignItems: 'center', gap: spacing.xs },
  corridorLine: {
    position: 'absolute',
    top: 13,
    left: '50%',
    right: '-50%',
    height: 1,
    backgroundColor: colors.surfaceBorder,
  },
  corridorLineLit: { backgroundColor: colors.cyan },
  corridorMarker: {
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
    backgroundColor: colors.bgElevated,
  },
  corridorMarkerComplete: { borderColor: colors.cyan, backgroundColor: colors.cyan },
  corridorMarkerActive: { borderColor: colors.gold, backgroundColor: colors.surfaceElevated },
  corridorNumber: { ...numericTypography.rank, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  corridorNumberActive: { color: colors.gold },
  corridorLabel: { ...typography.caption, fontSize: 9, lineHeight: 13, color: colors.textMuted, textAlign: 'center' },
  corridorLabelActive: { color: colors.textPrimary, fontFamily: 'Sora_600SemiBold' },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  panel: {},
  activeChapter: { borderColor: colors.surfaceBorderStrong },
  panelContent: { padding: spacing.lg, gap: spacing.md },
  panelTitle: { ...typography.title, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  steps: { gap: spacing.sm },
  step: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  stepNumber: { color: colors.cyan, fontFamily: 'Sora_600SemiBold' },
  stepLink: { color: colors.cyan, textDecorationLine: 'underline' },
  error: { ...typography.caption, color: colors.danger },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkedBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedBadge: { borderColor: colors.danger },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceBright,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { ...typography.body, flex: 1, color: colors.textPrimary, paddingVertical: 0 },
  dialogList: { gap: 2 },
  dialogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dialogRowActive: { backgroundColor: colors.surfaceElevated, borderColor: colors.cyan, borderLeftWidth: 3 },
  sourceMedallion: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBright,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  sourceMedallionActive: { borderColor: colors.cyan, backgroundColor: colors.surfaceElevated },
  sourceInitial: { ...typography.label, color: colors.textMuted },
  sourceInitialActive: { color: colors.cyan },
  folderWell: {
    width: 34,
    height: 34,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBright,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  folderWellActive: { borderColor: colors.cyan, backgroundColor: colors.surfaceElevated },
  dialogTitle: { ...typography.body, color: colors.textSecondary, flex: 1 },
  dialogTitleActive: { color: colors.textPrimary },
  dialogHandle: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  showMoreButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surfaceBright,
  },
  showMoreLabel: { ...typography.caption, fontFamily: 'Sora_500Medium', color: colors.cyan },
  importSummary: { borderColor: colors.cyan },
  importSummaryHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  importSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  importSummaryEyebrow: { ...typography.eyebrow, color: colors.cyan },
  importJobPanel: { borderColor: colors.surfaceBorderStrong },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  jobPct: { ...numericTypography.percent, color: colors.cyan },
});
