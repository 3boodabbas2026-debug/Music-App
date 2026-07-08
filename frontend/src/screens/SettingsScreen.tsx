import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BrandMark } from '../components/ui/BrandMark';
import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import * as telegramApi from '../services/api/telegram';
import type { TelegramStatus } from '../services/api/telegram';
import * as offlineMedia from '../services/storage/offlineMedia';
import type { OfflineEntry } from '../services/storage/offlineMedia';
import { useAuthStore } from '../store/authStore';
import { useLibraryStore } from '../store/libraryStore';
import { toast } from '../store/toastStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function StatusRow({ label, ok, pending }: { label: string; ok: boolean | null; pending?: boolean }) {
  const state: 'good' | 'bad' | 'unknown' = pending || ok === null ? 'unknown' : ok ? 'good' : 'bad';
  return (
    <View style={styles.statusRow}>
      <View
        style={[
          styles.statusDot,
          state === 'good' && styles.statusDotGood,
          state === 'bad' && styles.statusDotBad,
        ]}
      />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, state === 'bad' && styles.statusValueBad]}>
        {state === 'unknown' ? 'Checking…' : state === 'good' ? 'Connected' : 'Unavailable'}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const items = useLibraryStore((s) => s.items);
  const { networkOnline, backendOnline } = useOnlineStatus();

  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [offlineEntries, setOfflineEntries] = useState<OfflineEntry[]>([]);
  const [clearing, setClearing] = useState(false);

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
    } finally {
      setClearing(false);
    }
  }

  const audioCount = items.filter((m) => m.media_type === 'audio').length;
  const videoCount = items.length - audioCount;

  return (
    <View style={styles.root}>
      <ScreenContainer maxWidth={720}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.title}>Settings</Text>
            <View style={{ width: 22 }} />
          </View>

          <SectionTitle>CONNECTION</SectionTitle>
          <GlassPanel style={styles.panel}>
            <View style={styles.panelBody}>
              <StatusRow label="Network" ok={networkOnline} />
              <StatusRow label="Wavecairn API" ok={backendOnline} pending={backendOnline === null} />
              <StatusRow
                label="Telegram"
                ok={telegramStatus ? telegramStatus.authorized : null}
                pending={telegramStatus === null}
              />
              <Button
                label={telegramStatus?.authorized ? 'Manage Telegram import' : 'Connect Telegram'}
                variant="ghost"
                onPress={() => navigation.navigate('Telegram')}
                style={styles.inlineButton}
              />
            </View>
          </GlassPanel>

          <SectionTitle>ACCOUNT</SectionTitle>
          <GlassPanel style={styles.panel}>
            <View style={styles.panelBody}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Name</Text>
                <Text style={styles.fieldValue}>{user?.display_name ?? '—'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Email</Text>
                <Text style={styles.fieldValue}>{user?.email ?? '—'}</Text>
              </View>
            </View>
          </GlassPanel>

          <SectionTitle>LIBRARY &amp; STORAGE</SectionTitle>
          <GlassPanel style={styles.panel}>
            <View style={styles.panelBody}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>In your archive</Text>
                <Text style={styles.fieldValue}>
                  {items.length} tracks · {audioCount} audio · {videoCount} video
                </Text>
              </View>

              {offlineSupported ? (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Saved offline</Text>
                    <Text style={styles.fieldValue}>
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

          <SectionTitle>ABOUT</SectionTitle>
          <GlassPanel style={styles.panel}>
            <View style={[styles.panelBody, styles.aboutRow]}>
              <BrandMark size={28} />
              <View>
                <Text style={styles.fieldValue}>Wavecairn</Text>
                <Text style={styles.hint}>Your private signal archive.</Text>
              </View>
            </View>
          </GlassPanel>

          <Button
            label="Sign out"
            variant="danger"
            onPress={() => logout()}
            style={styles.signOutButton}
          />
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
  title: { ...typography.title, fontSize: 20, color: colors.textPrimary },
  sectionTitle: {
    ...typography.eyebrow,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  panel: { borderRadius: radii.lg },
  panelBody: { padding: spacing.lg, gap: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.textMuted },
  statusDotGood: { backgroundColor: colors.success },
  statusDotBad: { backgroundColor: colors.danger },
  statusLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  statusValue: { ...typography.caption, color: colors.textMuted },
  statusValueBad: { color: colors.danger },
  inlineButton: { marginTop: spacing.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fieldLabel: { ...typography.body, color: colors.textMuted },
  fieldValue: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary, textAlign: 'right', flexShrink: 1 },
  hint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signOutButton: { marginTop: spacing.xl },
});
