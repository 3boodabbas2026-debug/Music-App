import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Orb } from '../components/three/Orb';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { GlassPanel } from '../components/ui/GlassPanel';
import { GradientText } from '../components/ui/GradientText';
import { PressableScale } from '../components/ui/PressableScale';
import { WaveformScrubber } from '../components/player/WaveformScrubber';
import { usePlayerStore } from '../store/playerStore';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const PLAY_SIZE = 78;
const SIDE_SIZE = 48;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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

  if (!currentMedia) {
    navigation.goBack();
    return null;
  }

  // The 3D stage owns the top ~55% of the screen; the glass dock floats below.
  const stageHeight = height * 0.52;
  const orbSize = Math.min(width * 0.9, stageHeight * 0.86);

  const sleepMinutesLeft = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : null;
  const hasQueue = queue.length > 1;
  const nextTrack = !shuffle && hasQueue
    ? queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : undefined)
    : undefined;

  return (
    <View style={styles.root}>
      <AuroraBackground />

      <View style={[styles.stage, { height: stageHeight, paddingTop: insets.top }]}>
        <Orb state={playing ? 'playing' : 'idle'} amplitude={playing ? amplitude : 0} size={orbSize} />
      </View>

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
        <View style={styles.topSpacer} />
      </View>

      <View style={[styles.dockWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <GlassPanel style={styles.dock} overlayColor="rgba(15,23,42,0.6)">
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
                      color="#0B1120"
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
              <Pressable onPress={cycleSleepTimer} style={[styles.chip, sleepMinutesLeft !== null && styles.chipActive]}>
                <Ionicons name="moon" size={14} color={sleepMinutesLeft !== null ? colors.cyan : colors.textSecondary} />
                {sleepMinutesLeft !== null && <Text style={styles.chipLabelActive}> {sleepMinutesLeft}m</Text>}
              </Pressable>
              <Pressable onPress={() => seek(Math.min(duration, currentTime + 10))} style={styles.chip}>
                <MaterialIcons name="forward-10" size={17} color={colors.textSecondary} />
              </Pressable>
            </View>

            {nextTrack && (
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
                maximumTrackTintColor="rgba(148,163,184,0.25)"
                thumbTintColor={colors.cyan}
              />
            </View>
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
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
    backgroundColor: 'rgba(30,41,59,0.72)',
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
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  liveDot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  liveDotBuffering: { backgroundColor: colors.cyan },
  nowPlayingLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textSecondary },
  topSpacer: { width: 40 },
  dockWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
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
    backgroundColor: 'rgba(30,41,59,0.7)',
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
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  chipActive: { backgroundColor: 'rgba(56,189,248,0.16)' },
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
});
