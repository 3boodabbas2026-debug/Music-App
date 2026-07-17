import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../components/ui/Artwork';
import { SanctuaryMode } from '../components/scene/SanctuaryMode';
import { CoverBackdrop } from '../components/player/CoverBackdrop';
import { LyricsView } from '../components/player/LyricsView';
import { QueueList } from '../components/player/QueueList';
import { TrackDetails } from '../components/player/TrackDetails';
import { WaveformScrubber } from '../components/player/WaveformScrubber';
import { CompactGlassSheet } from '../components/ui/CompactGlassSheet';
import { PressableScale } from '../components/ui/PressableScale';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsive } from '../hooks/useResponsive';
import { useTrackAccent } from '../hooks/useTrackAccent';
import { useFavoritesStore } from '../store/favoritesStore';
import { usePinStore } from '../store/pinStore';
import { usePlayerStore } from '../store/playerStore';
import { displayArtist, displayTitle, thumbnailUri } from '../utils/mediaDisplay';
import { colors, glass, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Sheet = 'queue' | 'lyrics' | 'options' | null;
type MoreTab = 'playback' | 'details';

const PLAYER_SPARKS = [
  { left: '8%', top: '22%', size: 3, color: colors.gold },
  { left: '22%', top: '4%', size: 2, color: colors.textPrimary },
  { left: '72%', top: '9%', size: 2.5, color: colors.violet },
  { left: '90%', top: '35%', size: 2, color: colors.textPrimary },
  { left: '14%', top: '78%', size: 2.5, color: colors.violet },
  { left: '82%', top: '84%', size: 3, color: colors.gold },
] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function ModeButton({
  label,
  icon,
  active,
  onPress,
  badge,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      scaleTo={0.9}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Ionicons name={icon} size={20} color={active ? colors.cyan : colors.textSecondary} />
      {badge ? <Text style={[styles.modeBadge, active && styles.modeBadgeActive]}>{badge}</Text> : null}
    </PressableScale>
  );
}

function SheetTabs({ active, onChange }: { active: 'queue' | 'lyrics'; onChange: (next: 'queue' | 'lyrics') => void }) {
  return (
    <View style={styles.sheetTabs} accessibilityRole="tablist">
      {(['queue', 'lyrics'] as const).map((item) => {
        const selected = active === item;
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.sheetTab, selected && styles.sheetTabActive]}
          >
            <Text style={[styles.sheetTabLabel, selected && styles.sheetTabLabelActive]}>
              {item === 'queue' ? 'Up next' : 'Lyrics'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MoreTabs({ active, onChange }: { active: MoreTab; onChange: (next: MoreTab) => void }) {
  return (
    <View style={styles.sheetTabs} accessibilityRole="tablist">
      {(['playback', 'details'] as const).map((item) => {
        const selected = active === item;
        const label = item === 'playback' ? 'Playback' : 'Track';
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            style={[styles.sheetTab, selected && styles.sheetTabActive]}
          >
            <Text style={[styles.sheetTabLabel, selected && styles.sheetTabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width, height, isDesktop } = useResponsive();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetTab, setSheetTab] = useState<'queue' | 'lyrics'>('queue');
  const [moreTab, setMoreTab] = useState<MoreTab>('playback');
  const [sanctuary, setSanctuary] = useState(false);
  const reduceMotion = useReducedMotion();
  const artworkEntrance = useRef(new Animated.Value(0)).current;
  const listeningPulse = useRef(new Animated.Value(0)).current;

  const currentMedia = usePlayerStore((state) => state.currentMedia);
  const playing = usePlayerStore((state) => state.playing);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const crossfading = usePlayerStore((state) => state.crossfading);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const repeat = usePlayerStore((state) => state.repeat);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const rate = usePlayerStore((state) => state.rate);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const sleepAt = usePlayerStore((state) => state.sleepAt);
  const crossfadeEnabled = usePlayerStore((state) => state.crossfadeEnabled);
  const autoplayContinuation = usePlayerStore((state) => state.autoplayContinuation);
  const toggle = usePlayerStore((state) => state.toggle);
  const seek = usePlayerStore((state) => state.seek);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrev = usePlayerStore((state) => state.playPrev);
  const toggleRepeat = usePlayerStore((state) => state.toggleRepeat);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRate = usePlayerStore((state) => state.cycleRate);
  const cycleSleepTimer = usePlayerStore((state) => state.cycleSleepTimer);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const setCrossfadeEnabled = usePlayerStore((state) => state.setCrossfadeEnabled);
  const setAutoplayContinuation = usePlayerStore((state) => state.setAutoplayContinuation);

  const favoriteIds = useFavoritesStore((state) => state.ids);
  const toggleFavorite = useFavoritesStore((state) => state.toggle);
  const pinnedIds = usePinStore((state) => state.ids);
  const togglePin = usePinStore((state) => state.toggle);

  const coverUri = currentMedia ? thumbnailUri(currentMedia) : null;
  const accent = useTrackAccent(coverUri) ?? colors.cyan;
  const smallPhone = !isDesktop && width < 390;
  const compactControls = !isDesktop && width < 440;
  const artworkSize = Math.min(
    isDesktop ? 440 : width - (smallPhone ? spacing.md : spacing.lg) * 2,
    isDesktop ? height * 0.58 : height * (smallPhone ? 0.34 : 0.39),
    440,
  );

  useEffect(() => {
    if (!currentMedia) {
      navigation.goBack();
      return;
    }
    artworkEntrance.setValue(0);
    if (reduceMotion) {
      artworkEntrance.setValue(1);
      return;
    }
    const animation = Animated.spring(artworkEntrance, {
      toValue: 1,
      speed: 18,
      bounciness: 3,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [artworkEntrance, currentMedia?.id, navigation, reduceMotion]);

  useEffect(() => {
    listeningPulse.stopAnimation();
    if (!playing || reduceMotion) {
      listeningPulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(listeningPulse, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(listeningPulse, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listeningPulse, playing, reduceMotion]);

  const nextTrack = useMemo(() => {
    if (queue.length < 2) return null;
    return queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : null);
  }, [queue, queueIndex, repeat]);

  if (!currentMedia) return null;

  const isFavorite = !!favoriteIds[currentMedia.id];
  const isPinned = pinnedIds.includes(currentMedia.id);
  const sleepMinutes = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : null;
  const metadata = [
    currentMedia.album,
    currentMedia.genre,
    currentMedia.release_year ? String(currentMedia.release_year) : null,
    currentMedia.is_remix ? 'Remix' : null,
  ].filter(Boolean).join(' · ');

  const openPanel = (panel: 'queue' | 'lyrics') => {
    setSheetTab(panel);
    setSheet(panel);
  };

  const openMore = () => {
    setMoreTab('details');
    setSheet('options');
  };

  const artwork = (
    <Animated.View
      style={[
        styles.artworkShadow,
        {
          width: artworkSize,
          height: artworkSize,
          shadowColor: accent,
          opacity: artworkEntrance,
          transform: [{ scale: artworkEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.965, 1] }) }],
        },
      ]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.artworkAura}
      >
        <Animated.View
          style={[
            styles.auraRing,
            styles.auraRingOuter,
            {
              borderColor: `${accent}38`,
              opacity: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.68] }),
              transform: [{ scale: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.035] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.auraRing,
            styles.auraRingInner,
            {
              borderColor: `${colors.violet}30`,
              opacity: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.58, 0.24] }),
              transform: [{ scale: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [1.025, 0.985] }) }],
            },
          ]}
        />
        {PLAYER_SPARKS.map((spark, index) => (
          <Animated.View
            key={`${spark.left}-${spark.top}`}
            style={[
              styles.auraSpark,
              {
                left: spark.left,
                top: spark.top,
                width: spark.size,
                height: spark.size,
                borderRadius: spark.size,
                backgroundColor: spark.color,
                shadowColor: spark.color,
                opacity: listeningPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: index % 2 === 0 ? [0.38, 0.9] : [0.78, 0.34],
                }),
              },
            ]}
          />
        ))}
      </View>
      <Artwork media={currentMedia} size="100%" priority borderRadius={radii.lg} />
    </Animated.View>
  );

  const detailsAndControls = (
    <Animated.View
      style={[
        styles.controlColumn,
        isDesktop && styles.controlColumnDesktop,
        {
          opacity: artworkEntrance,
          transform: [{ translateY: artworkEntrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      <View style={styles.identityRow}>
        <View style={styles.identityText}>
          <Text numberOfLines={2} style={[styles.title, smallPhone && styles.titleSmall]}>{displayTitle(currentMedia)}</Text>
          <Text numberOfLines={1} style={styles.artist}>{displayArtist(currentMedia) ?? 'Unknown artist'}</Text>
          {!!metadata && <Text numberOfLines={1} style={styles.metadata}>{metadata}</Text>}
        </View>
        <Pressable
          onPress={() => toggleFavorite(currentMedia.id)}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: isFavorite }}
          hitSlop={10}
          style={styles.favoriteButton}
        >
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={24} color={isFavorite ? colors.coral : colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.scrubberBlock}>
        <WaveformScrubber
          seedKey={currentMedia.id}
          progress={duration ? currentTime / duration : 0}
          onSeekRatio={(ratio) => seek(ratio * duration)}
          activeColor={accent}
        />
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(currentTime)}</Text>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      </View>

      <View style={styles.transportRow}>
        <ModeButton label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'} icon="shuffle" active={shuffle} onPress={toggleShuffle} />
        <Pressable onPress={() => void playPrev()} accessibilityRole="button" accessibilityLabel="Previous track" style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
          <Ionicons name="play-skip-back" size={29} color={colors.textPrimary} />
        </Pressable>
        <PressableScale
          onPress={toggle}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          scaleTo={0.94}
          style={[styles.playButton, { backgroundColor: accent }]}
        >
          {isBuffering ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={34} color={colors.bg} style={playing ? undefined : styles.playNudge} />
          )}
        </PressableScale>
        <Pressable onPress={() => void playNext()} accessibilityRole="button" accessibilityLabel="Next track" style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
          <Ionicons name="play-skip-forward" size={29} color={colors.textPrimary} />
        </Pressable>
        <ModeButton label={`Repeat mode: ${repeat}`} icon="repeat" active={repeat !== 'off'} badge={repeat === 'one' ? '1' : undefined} onPress={toggleRepeat} />
      </View>

      <View style={[styles.secondaryRow, compactControls && styles.secondaryRowCompact]}>
        <Pressable onPress={() => openPanel('queue')} accessibilityRole="button" accessibilityLabel="Open queue" style={[styles.secondaryAction, compactControls && styles.secondaryActionCompact]}>
          <Ionicons name="list" size={19} color={colors.textSecondary} />
          <Text style={styles.secondaryLabel}>Up next</Text>
        </Pressable>
        <Pressable onPress={() => openPanel('lyrics')} accessibilityRole="button" accessibilityLabel="Open lyrics" style={[styles.secondaryAction, compactControls && styles.secondaryActionCompact]}>
          <Ionicons name="text" size={18} color={colors.textSecondary} />
          <Text style={styles.secondaryLabel}>Lyrics</Text>
        </Pressable>
        <Pressable
          onPress={() => setSanctuary(true)}
          accessibilityRole="button"
          accessibilityLabel="Enter Sanctuary Mode"
          style={[styles.secondaryAction, styles.sanctuaryAction, compactControls && styles.secondaryActionCompact]}
        >
          <Ionicons name="moon" size={17} color={accent} />
          <Text style={[styles.secondaryLabel, { color: accent }]}>Sanctuary</Text>
        </Pressable>
        <Pressable onPress={openMore} accessibilityRole="button" accessibilityLabel="More player options" style={[styles.secondaryAction, compactControls && styles.secondaryActionCompact]}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          <Text style={styles.secondaryLabel}>More</Text>
        </Pressable>
      </View>

      {nextTrack ? (
        <Pressable onPress={() => void playNext()} accessibilityRole="button" accessibilityLabel={`Play next: ${displayTitle(nextTrack)}`} style={styles.nextRow}>
          <Artwork media={nextTrack} size={42} borderRadius={radii.sm} />
          <View style={styles.nextText}>
            <Text style={styles.nextEyebrow}>UP NEXT</Text>
            <Text numberOfLines={1} style={styles.nextTitle}>{displayTitle(nextTrack)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {isDesktop ? (
        <View style={styles.volumeRow}>
          <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'} style={styles.volumeIcon}>
            <Ionicons name={muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'} size={18} color={colors.textSecondary} />
          </Pressable>
          <Slider
            style={styles.volumeSlider}
            value={muted ? 0 : volume}
            onValueChange={setVolume}
            minimumTrackTintColor={accent}
            maximumTrackTintColor={colors.surfaceBright}
            thumbTintColor={accent}
          />
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <CoverBackdrop uri={coverUri} blurRadius={54} />
      <View style={styles.backdropVeil} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close player" style={styles.topButton}>
          <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.playingState}>
          <View style={[styles.stateDot, { backgroundColor: crossfading ? colors.violet : accent }]} />
          <Text style={styles.playingStateLabel}>{crossfading ? 'AUTOMIX' : isBuffering ? 'BUFFERING' : 'NOW PLAYING'}</Text>
        </View>
        <Pressable onPress={openMore} accessibilityRole="button" accessibilityLabel="More player options" style={styles.topButton}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isDesktop ? (
        <View style={[styles.desktopLayout, { paddingTop: insets.top + 88, paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.desktopArtworkColumn}>{artwork}</View>
          {detailsAndControls}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.mobileContent,
            smallPhone && styles.mobileContentSmall,
            { paddingTop: insets.top + 70, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          {artwork}
          {detailsAndControls}
        </ScrollView>
      )}

      <SanctuaryMode visible={sanctuary} onClose={() => setSanctuary(false)} accent={accent} />

      <CompactGlassSheet
        visible={sheet === 'options'}
        onClose={() => setSheet(null)}
        accessibilityLabel={moreTab === 'playback' ? 'Playback options' : 'Track details'}
        header={<MoreTabs active={moreTab} onChange={setMoreTab} />}
        maxWidth={500}
        maxHeightRatio={0.82}
        scrollable
        contentContainerStyle={styles.optionsContent}
      >
        {moreTab === 'playback' ? (
          <>
            <Pressable onPress={cycleRate} style={styles.optionRow} accessibilityRole="button" accessibilityLabel={`Playback speed ${rate} times`}>
              <View style={styles.optionIcon}><Ionicons name="speedometer-outline" size={19} color={colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>Playback speed</Text><Text style={styles.optionSubtitle}>Useful for long mixes and spoken audio</Text></View>
              <Text style={styles.optionValue}>{rate}×</Text>
            </Pressable>
            <Pressable onPress={cycleSleepTimer} style={styles.optionRow} accessibilityRole="button" accessibilityLabel="Cycle sleep timer">
              <View style={styles.optionIcon}><Ionicons name="moon-outline" size={19} color={colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>Sleep timer</Text><Text style={styles.optionSubtitle}>Pause automatically</Text></View>
              <Text style={styles.optionValue}>{sleepMinutes ? `${sleepMinutes} min` : 'Off'}</Text>
            </Pressable>
            <View style={styles.optionRow}>
              <View style={styles.optionIcon}><Ionicons name="git-merge-outline" size={19} color={colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>Smooth transitions</Text><Text style={styles.optionSubtitle}>Blend one track into the next</Text></View>
              <Switch
                accessibilityLabel="Smooth transitions"
                accessibilityHint="Blend the end of one track into the start of the next instead of a hard cut."
                value={crossfadeEnabled}
                onValueChange={setCrossfadeEnabled}
                trackColor={{ false: colors.surfaceBorderStrong, true: colors.cyan }}
                thumbColor={crossfadeEnabled ? colors.textInverse : colors.textSecondary}
              />
            </View>
            <View style={styles.optionRow}>
              <View style={styles.optionIcon}><Ionicons name="infinite-outline" size={19} color={colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>Keep the music going</Text><Text style={styles.optionSubtitle}>Continue from your library when the queue ends</Text></View>
              <Switch
                accessibilityLabel="Keep the music going"
                accessibilityHint="When your queue runs out, keep playing from your library instead of stopping."
                value={autoplayContinuation}
                onValueChange={setAutoplayContinuation}
                trackColor={{ false: colors.surfaceBorderStrong, true: colors.cyan }}
                thumbColor={autoplayContinuation ? colors.textInverse : colors.textSecondary}
              />
            </View>
            <Pressable onPress={() => togglePin(currentMedia.id)} style={styles.optionRow} accessibilityRole="button" accessibilityState={{ selected: isPinned }}>
              <View style={styles.optionIcon}><Ionicons name={isPinned ? 'bookmark' : 'bookmark-outline'} size={19} color={isPinned ? colors.gold : colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>{isPinned ? 'Pinned to Today' : 'Pin to Today'}</Text><Text style={styles.optionSubtitle}>Keep this track close</Text></View>
            </Pressable>
            <Pressable onPress={() => toggleFavorite(currentMedia.id)} style={styles.optionRow} accessibilityRole="button" accessibilityState={{ selected: isFavorite }}>
              <View style={styles.optionIcon}><Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={19} color={isFavorite ? colors.coral : colors.textSecondary} /></View>
              <View style={styles.optionText}><Text style={styles.optionTitle}>{isFavorite ? 'Remove favorite' : 'Add to favorites'}</Text><Text style={styles.optionSubtitle}>Update your collection</Text></View>
            </Pressable>
          </>
        ) : (
          <TrackDetails media={currentMedia} />
        )}
      </CompactGlassSheet>

      <CompactGlassSheet
        visible={sheet === 'queue' || sheet === 'lyrics'}
        onClose={() => setSheet(null)}
        accessibilityLabel={sheetTab === 'queue' ? 'Up next queue' : 'Lyrics'}
        header={<SheetTabs active={sheetTab} onChange={setSheetTab} />}
        maxWidth={620}
        maxHeightRatio={0.84}
        bodyStyle={sheetTab === 'lyrics' ? { height: Math.min(520, height * 0.58) } : styles.queueSheetBody}
      >
        {sheetTab === 'queue' ? <QueueList /> : <LyricsView />}
      </CompactGlassSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backdropVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: glass.fillHeavy },
  topBar: { position: 'absolute', zIndex: 10, top: 0, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fillHeavy, borderWidth: 1, borderColor: colors.surfaceBorder },
  playingState: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: glass.fill },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  playingStateLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.8, color: colors.textSecondary },
  mobileContent: { alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.lg },
  mobileContentSmall: { paddingHorizontal: spacing.md, gap: spacing.md },
  desktopLayout: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl, paddingHorizontal: spacing.xxl },
  desktopArtworkColumn: { flex: 1, alignItems: 'flex-end' },
  artworkShadow: { borderRadius: radii.lg, shadowOpacity: 0.3, shadowRadius: 38, shadowOffset: { width: 0, height: 20 }, elevation: 16 },
  artworkAura: { position: 'absolute', top: -34, right: -34, bottom: -34, left: -34, alignItems: 'center', justifyContent: 'center' },
  auraRing: { position: 'absolute', borderWidth: 1 },
  auraRingOuter: { width: '100%', height: '100%', borderRadius: radii.xl + 26 },
  auraRingInner: { width: '90%', height: '90%', borderRadius: radii.xl + 18 },
  auraSpark: { position: 'absolute', shadowOpacity: 0.85, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  controlColumn: { width: '100%', maxWidth: 520, gap: spacing.md },
  controlColumnDesktop: { flex: 1, paddingRight: spacing.xl },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1 },
  title: { ...typography.title, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  titleSmall: { fontSize: 21, lineHeight: 27 },
  artist: { ...typography.subtitle, color: colors.textSecondary, marginTop: 3 },
  metadata: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  favoriteButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  scrubberBlock: { marginTop: spacing.xs },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  time: { ...typography.caption, fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  transportRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: glass.tintPrimary },
  modeBadge: { position: 'absolute', fontSize: 8, color: colors.textMuted, fontFamily: 'Sora_700Bold' },
  modeBadgeActive: { color: colors.cyan },
  skipButton: { width: 50, height: 50, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  playNudge: { marginLeft: 4 },
  pressed: { opacity: 0.65 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  secondaryRowCompact: { flexWrap: 'wrap', gap: spacing.sm },
  secondaryAction: { minWidth: 78, minHeight: 46, borderRadius: radii.pill, paddingHorizontal: spacing.md - 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder },
  secondaryActionCompact: { flexGrow: 1, flexBasis: '42%', minWidth: 132 },
  sanctuaryAction: { borderColor: glass.tintPrimaryStroke },
  secondaryLabel: { ...typography.caption, color: colors.textSecondary },
  nextRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceBorder, marginTop: spacing.xs, paddingTop: spacing.md },
  nextText: { flex: 1 },
  nextEyebrow: { ...typography.eyebrow, fontSize: 9, letterSpacing: 1.6, color: colors.textMuted },
  nextTitle: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  volumeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  volumeSlider: { flex: 1, height: 36 },
  sheetTabs: { flexDirection: 'row', padding: 4, borderRadius: radii.pill, backgroundColor: colors.bg },
  sheetTab: { flex: 1, minHeight: 42, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  sheetTabActive: { backgroundColor: colors.surfaceBright },
  sheetTabLabel: { ...typography.caption, color: colors.textMuted },
  sheetTabLabelActive: { color: colors.textPrimary, fontFamily: 'Sora_600SemiBold' },
  queueSheetBody: { flexShrink: 1, maxHeight: 520 },
  optionsContent: { paddingBottom: spacing.sm },
  optionRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  optionIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1 },
  optionTitle: { ...typography.subtitle, fontSize: 15, color: colors.textPrimary },
  optionSubtitle: { ...typography.caption, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  optionValue: { ...typography.caption, color: colors.cyan },
});
