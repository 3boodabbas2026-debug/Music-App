import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Moonlight } from '../components/three/Moonlight';
import { RippleField } from '../components/ui/RippleField';
import { GlassPanel } from '../components/ui/GlassPanel';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { LyricsView } from '../components/player/LyricsView';
import { QueueList } from '../components/player/QueueList';
import { WaveformScrubber } from '../components/player/WaveformScrubber';
import { useResponsive } from '../hooks/useResponsive';
import { useTrackAccent } from '../hooks/useTrackAccent';
import { usePlayerStore } from '../store/playerStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const PLAY_SIZE = 78;
const SIDE_SIZE = 48;
const SIDE_PANEL_WIDTH = 380;

type PanelTab = 'queue' | 'lyrics';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PanelTabs({ tab, onChange }: { tab: PanelTab; onChange: (tab: PanelTab) => void }) {
  return (
    <View style={styles.panelTabs}>
      {(
        [
          { key: 'queue', label: 'Up next', icon: 'list' },
          { key: 'lyrics', label: 'Lyrics', icon: 'text' },
        ] as const
      ).map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onChange(item.key)}
          style={[styles.panelTab, tab === item.key && styles.panelTabActive]}
        >
          <Ionicons name={item.icon} size={14} color={tab === item.key ? colors.cyan : colors.textMuted} />
          <Text style={[styles.panelTabLabel, tab === item.key && styles.panelTabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isDesktop } = useResponsive();
  const [panelTab, setPanelTab] = useState<PanelTab>('queue');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sanctuaryMode, setSanctuaryMode] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    currentMedia,
    playing,
    currentTime,
    duration,
    isBuffering,
    amplitude,
    queue,
    queueIndex,
    repeat,
    shuffle,
    rate,
    volume,
    muted,
    sleepAt,
    toggle,
    seek,
    playNext,
    playPrev,
    toggleRepeat,
    toggleShuffle,
    cycleRate,
    setVolume,
    toggleMute,
    cycleSleepTimer,
  } = usePlayerStore();
  const accentColor = useTrackAccent(currentMedia?.thumbnail_url);

  useEffect(() => {
    if (!sanctuaryMode) {
      setChromeVisible(true);
      chromeOpacity.setValue(1);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return;
    }
    wakeChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanctuaryMode]);

  function wakeChrome() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setChromeVisible(true);
    Animated.timing(chromeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(chromeOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setChromeVisible(false);
      });
    }, 3000);
  }

  if (!currentMedia) {
    navigation.goBack();
    return null;
  }

  // The 3D stage owns the top ~55% of the vertical space; the glass dock floats below.
  const stageWidth = isDesktop ? width - SIDE_PANEL_WIDTH - spacing.xl * 2 : width;
  const stageHeight = height * (isDesktop ? 0.5 : 0.52);
  const orbSize = Math.min(stageWidth * 0.9, stageHeight * 0.86, 460);

  const sleepMinutesLeft = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : null;
  const hasQueue = queue.length > 1;
  const nextTrack = !shuffle && hasQueue
    ? queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : undefined)
    : undefined;

  const transport = (
    <GlassPanel style={styles.dock} overlayColor="rgba(10,15,13,0.6)">
      <View style={styles.dockContent}>
        <GradientText numberOfLines={1} style={styles.title}>
          {currentMedia.title ?? currentMedia.recognized_title ?? 'Untitled'}
        </GradientText>
        <Text numberOfLines={1} style={styles.artist}>
          {currentMedia.artist ?? currentMedia.recognized_artist ?? 'Unknown artist'}
        </Text>

        <WaveformScrubber
          seedKey={currentMedia.id}
          progress={duration ? currentTime / duration : 0}
          onSeekRatio={(ratio) => seek(ratio * duration)}
        />
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(currentTime)}</Text>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>

        <View style={styles.transportRow}>
          <Pressable onPress={toggleShuffle} hitSlop={10} style={styles.modeButton}>
            <Ionicons name="shuffle" size={20} color={shuffle ? colors.cyan : colors.textMuted} />
          </Pressable>

          <PressableScale onPress={() => playPrev()} scaleTo={0.88}>
            <View style={styles.sideButton}>
              <Ionicons name="play-skip-back" size={22} color={colors.textSecondary} />
            </View>
          </PressableScale>

          <PressableScale onPress={toggle} scaleTo={0.92}>
            <View style={styles.playShadow}>
              <LinearGradient
                colors={colors.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playButton}
              >
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={32}
                  color="#0A0F0D"
                  style={playing ? undefined : styles.playGlyphNudge}
                />
              </LinearGradient>
            </View>
          </PressableScale>

          <PressableScale onPress={() => playNext()} scaleTo={0.88}>
            <View style={styles.sideButton}>
              <Ionicons name="play-skip-forward" size={22} color={colors.textSecondary} />
            </View>
          </PressableScale>

          <Pressable onPress={toggleRepeat} hitSlop={10} style={styles.modeButton}>
            <Ionicons name="repeat" size={20} color={repeat !== 'off' ? colors.cyan : colors.textMuted} />
            {repeat === 'one' && <Text style={styles.repeatOne}>1</Text>}
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          <Pressable onPress={() => seek(Math.max(0, currentTime - 10))} style={styles.chip}>
            <MaterialIcons name="replay-10" size={17} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={cycleRate} style={[styles.chip, rate !== 1 && styles.chipActive]}>
            <Text style={[styles.chipLabel, rate !== 1 && styles.chipLabelActive]}>{rate}×</Text>
          </Pressable>
          {!isDesktop && (
            <>
              <Pressable
                onPress={() => {
                  setPanelTab('queue');
                  setSheetOpen(true);
                }}
                style={styles.chip}
              >
                <Ionicons name="list" size={15} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setPanelTab('lyrics');
                  setSheetOpen(true);
                }}
                style={styles.chip}
              >
                <Ionicons name="text" size={14} color={colors.textSecondary} />
              </Pressable>
            </>
          )}
          <Pressable onPress={cycleSleepTimer} style={[styles.chip, sleepMinutesLeft !== null && styles.chipActive]}>
            <Ionicons name="moon" size={14} color={sleepMinutesLeft !== null ? colors.cyan : colors.textSecondary} />
            {sleepMinutesLeft !== null && <Text style={styles.chipLabelActive}> {sleepMinutesLeft}m</Text>}
          </Pressable>
          <Pressable onPress={() => seek(Math.min(duration, currentTime + 10))} style={styles.chip}>
            <MaterialIcons name="forward-10" size={17} color={colors.textSecondary} />
          </Pressable>
        </View>

        {nextTrack && !isDesktop && (
          <Pressable onPress={() => playNext()} style={styles.upNextRow}>
            <Ionicons name="chevron-forward-circle-outline" size={14} color={colors.textMuted} />
            <Text numberOfLines={1} style={styles.upNextText}>
              Up next · {nextTrack.title ?? nextTrack.recognized_title ?? 'Untitled'}
            </Text>
          </Pressable>
        )}

        <View style={styles.volumeRow}>
          <Pressable onPress={toggleMute} hitSlop={10}>
            <Ionicons
              name={muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
              size={18}
              color={muted ? colors.danger : colors.textMuted}
            />
          </Pressable>
          <Slider
            style={styles.volumeSlider}
            value={muted ? 0 : volume}
            onValueChange={(v) => setVolume(v)}
            minimumTrackTintColor={colors.cyan}
            maximumTrackTintColor="rgba(167,176,168,0.25)"
            thumbTintColor={colors.cyan}
          />
        </View>
      </View>
    </GlassPanel>
  );

  const topBar = (
    <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + spacing.sm }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeButton}>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={styles.nowPlayingChip}>
        <View style={[styles.liveDot, isBuffering && styles.liveDotBuffering]} />
        <Text style={styles.nowPlayingLabel}>
          {isBuffering ? 'BUFFERING' : hasQueue ? `TRACK ${queueIndex + 1} OF ${queue.length}` : 'NOW PLAYING'}
        </Text>
      </View>
      <Pressable onPress={() => setSanctuaryMode(true)} hitSlop={12} style={styles.closeButton}>
        <Ionicons name="leaf-outline" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  if (sanctuaryMode) {
    const sanctuarySize = Math.min(width, height) * 0.72;
    return (
      <Pressable style={styles.root} onPress={wakeChrome}>
        <RippleField />
        <View style={styles.sanctuaryStage}>
          <Moonlight state={playing ? 'playing' : 'idle'} amplitude={playing ? amplitude : 0} size={sanctuarySize} accentColor={accentColor ?? undefined} />
        </View>

        <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} style={[styles.sanctuaryChrome, { opacity: chromeOpacity, paddingBottom: insets.bottom + spacing.xl, paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => setSanctuaryMode(false)} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="contract-outline" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.sanctuaryMeta}>
            <GradientText numberOfLines={1} style={styles.title}>
              {currentMedia.title ?? currentMedia.recognized_title ?? 'Untitled'}
            </GradientText>
            <Text numberOfLines={1} style={styles.artist}>
              {currentMedia.artist ?? currentMedia.recognized_artist ?? 'Unknown artist'}
            </Text>

            <View style={styles.sanctuaryProgress}>
              <View style={[styles.sanctuaryProgressFill, { width: `${duration ? (currentTime / duration) * 100 : 0}%` }]} />
            </View>

            <View style={styles.sanctuaryControls}>
              <PressableScale onPress={() => playPrev()} scaleTo={0.88}>
                <View style={styles.sideButton}>
                  <Ionicons name="play-skip-back" size={20} color={colors.textSecondary} />
                </View>
              </PressableScale>
              <PressableScale onPress={toggle} scaleTo={0.92}>
                <View style={styles.playShadow}>
                  <LinearGradient colors={colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playButton}>
                    <Ionicons name={playing ? 'pause' : 'play'} size={30} color="#0A0F0D" style={playing ? undefined : styles.playGlyphNudge} />
                  </LinearGradient>
                </View>
              </PressableScale>
              <PressableScale onPress={() => playNext()} scaleTo={0.88}>
                <View style={styles.sideButton}>
                  <Ionicons name="play-skip-forward" size={20} color={colors.textSecondary} />
                </View>
              </PressableScale>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  if (isDesktop) {
    return (
      <View style={styles.root}>
        <RippleField />
        <View style={[styles.desktopRow, { paddingTop: insets.top + spacing.xl + 40, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.desktopStageCol}>
            <View style={styles.desktopStage}>
              <Moonlight state={playing ? 'playing' : 'idle'} amplitude={playing ? amplitude : 0} size={orbSize} accentColor={accentColor ?? undefined} />
            </View>
            <View style={styles.desktopDockWrap}>{transport}</View>
          </View>

          <GlassPanel style={styles.sidePanel} overlayColor="rgba(10,16,32,0.66)">
            <View style={styles.sidePanelInner}>
              <PanelTabs tab={panelTab} onChange={setPanelTab} />
              {panelTab === 'queue' ? <QueueList /> : <LyricsView />}
            </View>
          </GlassPanel>
        </View>
        {topBar}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <RippleField />

      <View style={[styles.stage, { height: stageHeight, paddingTop: insets.top }]}>
        <Moonlight state={playing ? 'playing' : 'idle'} amplitude={playing ? amplitude : 0} size={orbSize} accentColor={accentColor ?? undefined} />
      </View>

      {topBar}

      <View style={[styles.dockWrap, { paddingBottom: insets.bottom + spacing.md }]}>{transport}</View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHandle} />
            <PanelTabs tab={panelTab} onChange={setPanelTab} />
            <View style={styles.sheetBody}>{panelTab === 'queue' ? <QueueList /> : <LyricsView />}</View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050805' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.6)',
  },
  liveDot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  liveDotBuffering: { backgroundColor: colors.cyan },
  nowPlayingLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  topSpacer: { width: 40 },
  dockWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  dock: { borderRadius: radii.lg },
  dockContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  title: { ...typography.title, fontSize: 22, lineHeight: 28, textAlign: 'center' },
  artist: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  time: { ...typography.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOne: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: colors.cyan,
  },
  sideButton: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    borderRadius: SIDE_SIZE / 2,
    backgroundColor: 'rgba(18,28,24,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playShadow: {
    borderRadius: PLAY_SIZE / 2,
    shadowColor: colors.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  playButton: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: PLAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyphNudge: { marginLeft: 4 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 52,
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.6)',
  },
  chipActive: { backgroundColor: 'rgba(47,191,170,0.16)' },
  chipLabel: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  chipLabelActive: { ...typography.caption, fontSize: 12, color: colors.cyan, fontFamily: 'SpaceGrotesk_500Medium' },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    maxWidth: '90%',
  },
  upNextText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  volumeSlider: { flex: 1, height: 32 },

  // ----- Desktop split -----
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  desktopStageCol: { flex: 1, minWidth: 0 },
  desktopStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  desktopDockWrap: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  sidePanel: {
    width: SIDE_PANEL_WIDTH,
    borderRadius: radii.lg,
  },
  sidePanelInner: { flex: 1, paddingTop: spacing.sm },
  panelTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  panelTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(18,28,24,0.55)',
  },
  panelTabActive: { backgroundColor: 'rgba(47,191,170,0.16)' },
  panelTabLabel: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  panelTabLabelActive: { color: colors.cyan, fontFamily: 'SpaceGrotesk_500Medium' },

  // ----- Mobile sheet -----
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(3,5,3,0.65)' },
  sheet: {
    height: '72%',
    backgroundColor: '#121C18',
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(167,176,168,0.3)',
    marginBottom: spacing.sm,
  },
  sheetBody: { flex: 1 },

  // ----- Sanctuary Mode -----
  sanctuaryStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sanctuaryChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  sanctuaryMeta: { alignItems: 'center', width: '100%', maxWidth: 420, gap: spacing.sm },
  sanctuaryProgress: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(167,176,168,0.2)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  sanctuaryProgressFill: { height: '100%', backgroundColor: colors.cyan },
  sanctuaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
});
