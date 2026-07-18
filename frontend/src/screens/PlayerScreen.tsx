import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
import { ContinuityFrame } from '../components/ui/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsive } from '../hooks/useResponsive';
import { useTrackAccent } from '../hooks/useTrackAccent';
import { motionPresets } from '../theme/motion';
import { useFavoritesStore } from '../store/favoritesStore';
import { usePinStore } from '../store/pinStore';
import { canPlayNext, canPlayPrevious, usePlayerStore } from '../store/playerStore';
import { useLibraryStore } from '../store/libraryStore';
import { displayArtist, displayTitle, thumbnailUri } from '../utils/mediaDisplay';
import { colors, glass, gradients, radii, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import type { Media } from '../services/api/types';

type Sheet = 'queue' | 'lyrics' | 'options' | null;
type MoreTab = 'playback' | 'details';

function ArtworkViewer({
  visible,
  onClose,
  media,
  uri,
  accent,
  width,
  height,
}: {
  visible: boolean;
  onClose: () => void;
  media: Media;
  uri: string | null;
  accent: string;
  width: number;
  height: number;
}) {
  const panelRef = useRef<View>(null);
  const viewerSize = Math.max(220, Math.min(width - spacing.lg * 2, height - 190, 900));

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      if (Platform.OS === 'web') (panelRef.current as unknown as HTMLElement | null)?.focus?.();
      else {
        const node = findNodeHandle(panelRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (Platform.OS === 'web') document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timer);
      if (Platform.OS === 'web') document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewerRoot} accessibilityViewIsModal>
        <CoverBackdrop uri={uri} blurRadius={70} />
        <View style={styles.viewerVeil} />
        <View style={styles.viewerHeader}>
          <View>
            <Text style={styles.viewerEyebrow}>ARTWORK VIEW</Text>
            <Text numberOfLines={1} style={styles.viewerTitle}>{displayTitle(media)}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close artwork viewer" style={styles.topButton}>
            <Ionicons name="close" size={23} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View
          ref={panelRef}
          accessible
          focusable
          role="dialog"
          accessibilityLabel={`${displayTitle(media)} artwork viewer`}
          style={styles.viewerContent}
          // RN Web maps this to a programmatically focusable dialog surface.
          tabIndex={-1}
        >
          <View style={[styles.viewerArtworkFrame, { width: viewerSize, height: viewerSize, borderColor: `${accent}55` }]}>
            <Artwork media={media} size="100%" priority borderRadius={radii.lg} contentFit="contain" />
          </View>
          <Text style={styles.viewerStatus}>
            {uri ? 'Best available artwork · shown uncropped' : 'No artwork was supplied · Starhollow fallback shown'}
          </Text>
        </View>
      </View>
    </Modal>
  );
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
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const insets = useSafeAreaInsets();
  const { width, height, isDesktop } = useResponsive();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetTab, setSheetTab] = useState<'queue' | 'lyrics'>('queue');
  const [moreTab, setMoreTab] = useState<MoreTab>('playback');
  const [sanctuary, setSanctuary] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [artworkAffordanceActive, setArtworkAffordanceActive] = useState(false);
  const closeArtwork = useCallback(() => setArtworkOpen(false), []);
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
  const playQueue = usePlayerStore((state) => state.playQueue);
  const libraryItems = useLibraryStore((state) => state.items);
  const libraryAudio = useMemo(() => libraryItems.filter((media) => media.media_type === 'audio'), [libraryItems]);

  const favoriteIds = useFavoritesStore((state) => state.ids);
  const toggleFavorite = useFavoritesStore((state) => state.toggle);
  const pinnedIds = usePinStore((state) => state.ids);
  const togglePin = usePinStore((state) => state.toggle);

  const coverUri = currentMedia ? thumbnailUri(currentMedia) : null;
  const trackAccent = useTrackAccent(coverUri);
  const smallPhone = !isDesktop && width < 390;
  const artworkSize = Math.min(
    isDesktop ? 440 : width - (smallPhone ? spacing.md : spacing.lg) * 2,
    isDesktop ? height * 0.58 : height * (smallPhone ? 0.34 : 0.39),
    440,
  );

  useEffect(() => {
    if (!currentMedia) return;
    artworkEntrance.setValue(0);
    if (reduceMotion) {
      artworkEntrance.setValue(1);
      return;
    }
    const animation = Animated.timing(artworkEntrance, {
      toValue: 1,
      duration: motionPresets.emphasis.duration,
      easing: motionPresets.emphasis.easing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [artworkEntrance, currentMedia?.id, navigation, reduceMotion]);

  useEffect(() => {
    if (route.params?.panel !== 'queue' || !currentMedia) return;
    setSheetTab('queue');
    setSheet('queue');
    navigation.setParams({ panel: undefined });
  }, [currentMedia, navigation, route.params?.panel]);

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
    if (shuffle) return null;
    if (queue.length < 2) return null;
    return queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : null);
  }, [queue, queueIndex, repeat, shuffle]);

  const transportState = { queue, queueIndex, currentTime, repeat, shuffle };
  const previousAvailable = canPlayPrevious(transportState);
  const nextAvailable = canPlayNext(transportState);

  if (!currentMedia) {
    return (
      <View style={styles.emptyRoot}>
        <CoverBackdrop uri={null} blurRadius={54} />
        <View style={styles.emptyVeil} />
        <View style={[styles.emptyTopBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={() => navigation.navigate('Main', { screen: 'Library' })} accessibilityRole="button" accessibilityLabel="Return to Library" style={styles.topButton}>
            <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ContinuityFrame stateKey="empty-player" minHeight={360} style={styles.emptyContinuity}>
        <View style={[styles.emptyCard, { paddingBottom: insets.bottom + spacing.xl }]} accessibilityRole="summary">
          <View style={styles.emptyConstellation} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="musical-notes" size={42} color={colors.cyan} />
          </View>
          <Text style={styles.emptyEyebrow}>THE HOLLOW IS QUIET</Text>
          <Text style={styles.emptyTitle}>Choose a track to wake the night.</Text>
          <Text style={styles.emptyDescription}>Your player is ready. Return to the Library, or start a queue from the music already in your collection.</Text>
          <View style={styles.emptyActions}>
            <Pressable onPress={() => navigation.navigate('Main', { screen: 'Library' })} accessibilityRole="button" style={styles.emptyPrimaryAction}>
              <Ionicons name="library" size={18} color={colors.bg} />
              <Text style={styles.emptyPrimaryLabel}>Browse Library</Text>
            </Pressable>
            <Pressable
              onPress={() => void playQueue(libraryAudio, 0)}
              disabled={libraryAudio.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Start a queue from my library"
              accessibilityState={{ disabled: libraryAudio.length === 0 }}
              accessibilityHint={libraryAudio.length === 0 ? 'Add music to your Library first.' : `Starts a queue with ${libraryAudio.length} tracks.`}
              style={[styles.emptySecondaryAction, libraryAudio.length === 0 && styles.transportDisabled]}
            >
              <Ionicons name="play" size={18} color={colors.cyan} />
              <Text style={styles.emptySecondaryLabel}>{libraryAudio.length ? 'Start my queue' : 'Library is empty'}</Text>
            </Pressable>
          </View>
        </View>
        </ContinuityFrame>
      </View>
    );
  }

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
          shadowColor: trackAccent.artworkAura,
          opacity: artworkEntrance,
          transform: [{ scale: artworkEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
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
              borderColor: `${trackAccent.artworkAura}38`,
              opacity: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.28] }),
              transform: [{ scale: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.018] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.auraRing,
            styles.auraRingInner,
            {
              borderColor: `${trackAccent.artworkAura}24`,
              opacity: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.12] }),
              transform: [{ scale: listeningPulse.interpolate({ inputRange: [0, 1], outputRange: [1.01, 0.992] }) }],
            },
          ]}
        />
      </View>
      <View style={styles.artworkMat}>
        <Pressable
          onPress={() => setArtworkOpen(true)}
          onFocus={() => setArtworkAffordanceActive(true)}
          onBlur={() => setArtworkAffordanceActive(false)}
          onHoverIn={() => setArtworkAffordanceActive(true)}
          onHoverOut={() => setArtworkAffordanceActive(false)}
          accessibilityRole="button"
          accessibilityLabel={`Inspect artwork for ${displayTitle(currentMedia)}`}
          accessibilityHint="Opens an uncropped full-screen artwork viewer."
          style={({ pressed }) => [styles.artworkInspectTarget, pressed && styles.artworkInspectPressed]}
        >
          <Artwork media={currentMedia} size="100%" priority borderRadius={radii.cover} />
          <View pointerEvents="none" style={styles.artworkInnerHighlight} />
          <View
            pointerEvents="none"
            style={[
              styles.artworkCornerAffordance,
              Platform.OS === 'web' && !artworkAffordanceActive && styles.artworkCornerAffordanceHidden,
              artworkAffordanceActive && styles.artworkCornerAffordanceActive,
            ]}
          >
            <Ionicons name="expand" size={15} color={colors.textPrimary} />
            {Platform.OS === 'web' && artworkAffordanceActive ? <Text style={styles.artworkInspectLabel}>View</Text> : null}
          </View>
        </Pressable>
      </View>
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
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={24} color={isFavorite ? colors.gold : colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.scrubberBlock}>
        <WaveformScrubber
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
          activeColor={trackAccent.waveform}
        />
      </View>

      <View style={styles.transportRow}>
        <View style={styles.transportSatelliteLeft}>
          <ModeButton label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'} icon="shuffle" active={shuffle} onPress={toggleShuffle} />
        </View>
        <View style={styles.transportCore}>
          <Pressable
            onPress={() => void playPrev()}
            disabled={!previousAvailable}
            accessibilityRole="button"
            accessibilityLabel="Previous track"
            accessibilityHint={previousAvailable ? 'Restarts this track after three seconds, otherwise plays the previous track.' : 'No previous track is available with repeat off.'}
            accessibilityState={{ disabled: !previousAvailable }}
            style={({ pressed }) => [styles.skipButton, !previousAvailable && styles.transportDisabled, pressed && styles.pressed]}
          >
            <Ionicons name="play-skip-back" size={28} color={previousAvailable ? colors.textPrimary : colors.textMuted} />
          </Pressable>
          <PressableScale
            onPress={toggle}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            scaleTo={0.94}
            style={[styles.playButton, { borderColor: `${trackAccent.playControl}8A`, shadowColor: trackAccent.playControl }]}
          >
            <View style={[styles.playButtonCore, { backgroundColor: trackAccent.playControl }]}>
              {isBuffering ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.bg} style={playing ? undefined : styles.playNudge} />
              )}
            </View>
          </PressableScale>
          <Pressable
            onPress={() => void playNext()}
            disabled={!nextAvailable}
            accessibilityRole="button"
            accessibilityLabel="Next track"
            accessibilityHint={nextAvailable ? 'Plays the next available track.' : 'You reached the end of the queue. Turn on repeat all or add more tracks.'}
            accessibilityState={{ disabled: !nextAvailable }}
            style={({ pressed }) => [styles.skipButton, !nextAvailable && styles.transportDisabled, pressed && styles.pressed]}
          >
            <Ionicons name="play-skip-forward" size={28} color={nextAvailable ? colors.textPrimary : colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.transportSatelliteRight}>
          <ModeButton label={`Repeat mode: ${repeat}`} icon="repeat" active={repeat !== 'off'} badge={repeat === 'one' ? '1' : undefined} onPress={toggleRepeat} />
        </View>
      </View>

      {!nextAvailable ? (
        <Text accessibilityRole="summary" aria-live="polite" style={styles.transportHint}>
          End of queue · add tracks or turn on Repeat All to keep skipping.
        </Text>
      ) : !previousAvailable ? (
        <Text accessibilityRole="summary" style={styles.transportHint}>Start of queue · Previous becomes available after three seconds.</Text>
      ) : null}

      <View style={styles.utilityStack}>
        <View style={styles.utilityRibbon} accessibilityRole="toolbar" accessibilityLabel="Player utilities">
          <Pressable onPress={() => openPanel('queue')} accessibilityRole="button" accessibilityLabel="Open queue" accessibilityState={{ selected: sheet === 'queue' }} style={styles.secondaryAction}>
            <Ionicons name="list-outline" size={18} color={sheet === 'queue' ? colors.cyan : colors.textSecondary} />
            <Text style={[styles.secondaryLabel, sheet === 'queue' && styles.secondaryLabelActive]}>Up next</Text>
            {sheet === 'queue' ? <View style={styles.utilityUnderline} /> : null}
          </Pressable>
          <Pressable onPress={() => openPanel('lyrics')} accessibilityRole="button" accessibilityLabel="Open lyrics" accessibilityState={{ selected: sheet === 'lyrics' }} style={styles.secondaryAction}>
            <Ionicons name="document-text-outline" size={18} color={sheet === 'lyrics' ? colors.cyan : colors.textSecondary} />
            <Text style={[styles.secondaryLabel, sheet === 'lyrics' && styles.secondaryLabelActive]}>Lyrics</Text>
            {sheet === 'lyrics' ? <View style={styles.utilityUnderline} /> : null}
          </Pressable>
          <Pressable onPress={() => setSanctuary(true)} accessibilityRole="button" accessibilityLabel="Enter Sanctuary Mode" accessibilityState={{ selected: sanctuary }} style={styles.secondaryAction}>
            <Ionicons name="moon-outline" size={18} color={sanctuary ? colors.cyan : colors.textSecondary} />
            <Text style={[styles.secondaryLabel, sanctuary && styles.secondaryLabelActive]}>Sanctuary</Text>
            {sanctuary ? <View style={styles.utilityUnderline} /> : null}
          </Pressable>
          <Pressable onPress={openMore} accessibilityRole="button" accessibilityLabel="More player options" accessibilityState={{ selected: sheet === 'options' }} style={styles.secondaryAction}>
            <Ionicons name="ellipsis-horizontal" size={18} color={sheet === 'options' ? colors.cyan : colors.textSecondary} />
            <Text style={[styles.secondaryLabel, sheet === 'options' && styles.secondaryLabelActive]}>More</Text>
            {sheet === 'options' ? <View style={styles.utilityUnderline} /> : null}
          </Pressable>
        </View>

        {nextTrack ? (
          <Pressable onPress={() => void playNext()} accessibilityRole="button" accessibilityLabel={`Play next: ${displayTitle(nextTrack)}`} style={styles.nextRow}>
            <Artwork media={nextTrack} size={38} borderRadius={radii.sm} />
            <View style={styles.nextText}>
              <Text style={styles.nextEyebrow}>NEXT ON THE ITINERARY</Text>
              <Text numberOfLines={1} style={styles.nextTitle}>{displayTitle(nextTrack)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isDesktop || Platform.OS === 'web' ? (
        <View style={[styles.volumeRow, !isDesktop && styles.volumeRowCompact]}>
          <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'} style={styles.volumeIcon}>
            <Ionicons name={muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'} size={18} color={colors.textSecondary} />
          </Pressable>
          <Slider
            style={styles.volumeSlider}
            value={muted ? 0 : volume}
            onValueChange={setVolume}
            step={0.05}
            accessibilityLabel="Playback volume"
            accessibilityValue={{ min: 0, max: 100, now: Math.round((muted ? 0 : volume) * 100), text: muted ? 'Muted' : `${Math.round(volume * 100)} percent` }}
            minimumTrackTintColor={colors.cyan}
            maximumTrackTintColor={colors.surfaceBright}
            thumbTintColor={colors.cyan}
          />
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <CoverBackdrop uri={coverUri} blurRadius={54} />
      <View style={styles.backdropVeil} />
      <LinearGradient
        pointerEvents="none"
        colors={gradients.playerScrim}
        start={isDesktop ? { x: 0.12, y: 0.5 } : { x: 0.5, y: 0.12 }}
        end={isDesktop ? { x: 0.82, y: 0.5 } : { x: 0.5, y: 0.78 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close player" style={styles.topButton}>
          <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.playingState}>
          <View style={[styles.stateDot, { backgroundColor: crossfading ? colors.violet : colors.cyan }]} />
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

      <SanctuaryMode visible={sanctuary} onClose={() => setSanctuary(false)} accent={colors.cyan} />
      <ArtworkViewer
        visible={artworkOpen}
        onClose={closeArtwork}
        media={currentMedia}
        uri={coverUri}
        accent={trackAccent.artworkAura}
        width={width}
        height={height}
      />

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
              <View style={styles.optionIcon}><Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={19} color={isFavorite ? colors.gold : colors.textSecondary} /></View>
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
  emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: glass.fillHeavy },
  emptyTopBar: { position: 'absolute', zIndex: 2, top: 0, left: spacing.lg },
  emptyCard: { width: '100%', maxWidth: 560, alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyContinuity: { alignItems: 'center', justifyContent: 'center' },
  emptyConstellation: { width: 96, height: 96, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.tintPrimary, borderWidth: 1, borderColor: glass.tintPrimaryStroke, shadowColor: colors.cyan, shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  emptyEyebrow: { ...typography.eyebrow, marginTop: spacing.xl, fontSize: 10, letterSpacing: 2.2, color: colors.cyan },
  emptyTitle: { ...typography.title, marginTop: spacing.sm, fontSize: 28, lineHeight: 35, textAlign: 'center', color: colors.textPrimary },
  emptyDescription: { ...typography.body, maxWidth: 480, marginTop: spacing.sm, textAlign: 'center', color: colors.textSecondary },
  emptyActions: { marginTop: spacing.xl, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  emptyPrimaryAction: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.cyan },
  emptyPrimaryLabel: { ...typography.subtitle, fontSize: 14, color: colors.bg },
  emptySecondaryAction: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: glass.fillBright, borderWidth: 1, borderColor: colors.surfaceBorderStrong },
  emptySecondaryLabel: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  backdropVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: glass.fillDeep },
  topBar: { position: 'absolute', zIndex: 10, top: 0, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fillHeavy, borderWidth: 1, borderColor: colors.surfaceBorder },
  playingState: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: glass.fill },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  playingStateLabel: { ...typography.eyebrow, fontSize: 10, letterSpacing: 1.8, color: colors.textSecondary },
  mobileContent: { alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.xl },
  mobileContentSmall: { paddingHorizontal: spacing.md, gap: spacing.lg },
  desktopLayout: { flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 88, paddingHorizontal: spacing.xxl },
  desktopArtworkColumn: { flex: 1, maxWidth: 520, alignItems: 'flex-end', justifyContent: 'center' },
  artworkShadow: { borderRadius: radii.lg, shadowOpacity: 0.22, shadowRadius: 34, shadowOffset: { width: 0, height: 18 }, elevation: 14 },
  artworkMat: { width: '100%', height: '100%', padding: 9, borderRadius: radii.lg, backgroundColor: glass.fillDeep, borderWidth: 1, borderColor: glass.strokeStrong },
  artworkInspectTarget: { flex: 1, borderRadius: radii.cover, overflow: 'hidden' },
  artworkInspectPressed: { opacity: 0.88 },
  artworkInnerHighlight: { ...(StyleSheet.absoluteFill as object), borderRadius: radii.cover, borderWidth: 1, borderColor: glass.edgeRaised },
  artworkCornerAffordance: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, minWidth: 34, height: 34, paddingHorizontal: spacing.sm, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: glass.fillHeavy, borderWidth: 1, borderColor: colors.surfaceBorderStrong, opacity: 0.76 },
  artworkCornerAffordanceHidden: { opacity: 0.08, transform: [{ translateY: 3 }] },
  artworkCornerAffordanceActive: { opacity: 1, transform: [{ translateY: 0 }] },
  artworkInspectLabel: { ...typography.caption, fontSize: 10, color: colors.textPrimary },
  artworkAura: { position: 'absolute', top: -30, right: -30, bottom: -30, left: -30, alignItems: 'center', justifyContent: 'center' },
  auraRing: { position: 'absolute', borderWidth: 1 },
  auraRingOuter: { width: '100%', height: '100%', borderRadius: radii.xl + 26 },
  auraRingInner: { width: '92%', height: '92%', borderRadius: radii.xl + 18 },
  controlColumn: { width: '100%', maxWidth: 520 },
  controlColumnDesktop: { flex: 1, maxWidth: 520 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1 },
  title: { ...typography.title, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  titleSmall: { fontSize: 21, lineHeight: 27 },
  artist: { ...typography.subtitle, color: colors.textSecondary, marginTop: 3 },
  metadata: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  favoriteButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  scrubberBlock: { marginTop: spacing.lg },
  transportRow: { position: 'relative', minHeight: 92, marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  transportCore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  transportSatelliteLeft: { position: 'absolute', left: 0 },
  transportSatelliteRight: { position: 'absolute', right: 0 },
  modeButton: { width: 42, height: 42, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', backgroundColor: glass.fillDeep },
  modeButtonActive: { backgroundColor: glass.tintPrimary, borderColor: glass.tintPrimaryStroke },
  modeBadge: { position: 'absolute', fontSize: 8, color: colors.textMuted, fontFamily: 'Sora_700Bold' },
  modeBadgeActive: { color: colors.cyan },
  skipButton: { width: 54, height: 54, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fillHeavy, borderWidth: 1, shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 12 },
  playButtonCore: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: glass.edgeRaised },
  playNudge: { marginLeft: 4 },
  pressed: { opacity: 0.65 },
  transportDisabled: { opacity: 0.38 },
  transportHint: { ...typography.caption, marginTop: -spacing.xs, textAlign: 'center', color: colors.textMuted },
  utilityStack: { marginTop: spacing.lg },
  utilityRibbon: { minHeight: 60, flexDirection: 'row', alignItems: 'stretch', borderRadius: radii.card, backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder, overflow: 'hidden' },
  secondaryAction: { position: 'relative', flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: spacing.xs, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
  secondaryLabel: { ...typography.caption, color: colors.textSecondary },
  secondaryLabelActive: { color: colors.textPrimary, fontFamily: 'Sora_600SemiBold' },
  utilityUnderline: { position: 'absolute', left: '32%', right: '32%', bottom: 0, height: 2, borderRadius: radii.pill, backgroundColor: colors.cyan },
  nextRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderWidth: 1, borderTopColor: glass.stroke, borderColor: colors.surfaceBorder, borderBottomLeftRadius: radii.card, borderBottomRightRadius: radii.card, backgroundColor: glass.fillDeep },
  nextText: { flex: 1 },
  nextEyebrow: { ...typography.eyebrow, fontSize: 9, letterSpacing: 1.6, color: colors.textMuted },
  nextTitle: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  volumeRowCompact: { minHeight: 52, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: glass.fill, borderWidth: 1, borderColor: colors.surfaceBorder },
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
  viewerRoot: { flex: 1, backgroundColor: colors.bg },
  viewerVeil: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(4,12,24,0.86)' },
  viewerHeader: { zIndex: 2, minHeight: 78, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  viewerEyebrow: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.cyan },
  viewerTitle: { ...typography.subtitle, maxWidth: 520, color: colors.textPrimary, marginTop: 2 },
  viewerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  viewerArtworkFrame: { maxWidth: '100%', maxHeight: '100%', borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, shadowColor: colors.cyan, shadowOpacity: 0.3, shadowRadius: 36, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  viewerStatus: { ...typography.caption, marginTop: spacing.md, color: colors.textSecondary, textAlign: 'center' },
});
