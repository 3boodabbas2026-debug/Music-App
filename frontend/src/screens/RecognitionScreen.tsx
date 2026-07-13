import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { Starwell } from '../components/scene/Starwell';
import { MiniPlayerBar } from '../components/player/MiniPlayerBar';
import { useBottomChromeClearance } from '../hooks/useBottomChromeClearance';
import { useResponsive } from '../hooks/useResponsive';
import { RippleField } from '../components/ui/RippleField';
import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Artwork } from '../components/ui/Artwork';
import { PressableScale } from '../components/ui/PressableScale';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import * as recognitionsApi from '../services/api/recognitions';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { useScanHistoryStore } from '../store/scanHistoryStore';
import { toast } from '../store/toastStore';
import { apiErrorMessage, friendlyJobError, friendlyJobStage } from '../utils/apiError';
import { colors, glass, gradients, radii, spacing, typography } from '../theme/tokens';

const LISTEN_SECONDS = 15;

const BUTTON_SIZE = 208;
const RING_SIZE = BUTTON_SIZE + 26;
const RING_STROKE = 3.5;
const PULSE_SIZE = BUTTON_SIZE + 26;
const WAVE_BARS = 26;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Phase = 'idle' | 'listening' | 'analyzing' | 'result';

function meteringToAmplitude(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  return Math.max(0, Math.min(1, (metering + 60) / 60));
}

export function RecognitionScreen() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const bottomChromeClearance = useBottomChromeClearance();
  // This tab stays mounted when the user switches to Home/Library — without
  // this, its RippleField + Starwell instance keeps animating invisibly.
  const isFocused = useIsFocused();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(LISTEN_SECONDS);
  const [match, setMatch] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadJob, setDownloadJob] = useState<Job | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeDownload = useRef<(() => void) | null>(null);
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const scanHistory = useScanHistoryStore((s) => s.entries);
  const addScan = useScanHistoryStore((s) => s.add);
  const clearScans = useScanHistoryStore((s) => s.clear);
  const [manualQuery, setManualQuery] = useState('');
  const [mode, setMode] = useState<recognitionsApi.RecognitionMode>('recording');
  const [capabilities, setCapabilities] = useState<recognitionsApi.RecognitionCapabilities | null>(null);

  const pulseA = useRef(new Animated.Value(0)).current;
  const pulseB = useRef(new Animated.Value(0)).current;
  const bgShift = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const idleSpin = useRef(new Animated.Value(0)).current;

  // A slow dashed orbit around the button while idle — invites the tap.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(idleSpin, { toValue: 1, duration: 26000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [idleSpin]);

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
      unsubscribeDownload.current?.();
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    recognitionsApi
      .getCapabilities()
      .then((value) => {
        if (!alive) return;
        setCapabilities(value);
        if (!value.humming) setMode('recording');
      })
      .catch(() => {
        if (alive) setCapabilities({ recording: true, humming: false, humming_provider: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Sonar pulses + background drift + the 8s countdown ring. Presentation only.
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'analyzing') return;

    const makePulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    const ringA = makePulse(pulseA, 0);
    const ringB = makePulse(pulseB, 1100);
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(bgShift, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bgShift, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    ringA.start();
    ringB.start();
    drift.start();

    return () => {
      ringA.stop();
      ringB.stop();
      drift.stop();
      pulseA.setValue(0);
      pulseB.setValue(0);
      Animated.timing(bgShift, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    };
  }, [phase, pulseA, pulseB, bgShift]);

  useEffect(() => {
    if (phase === 'listening') {
      ringAnim.setValue(0);
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: LISTEN_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      return () => ringAnim.stopAnimation();
    }
    ringAnim.setValue(0);
    return undefined;
  }, [phase, ringAnim]);

  async function startListening() {
    setError(null);
    setMatch(null);
    setDownloadJob(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone access is required to identify songs.');
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('listening');
      setCountdown(LISTEN_SECONDS);

      tickTimer.current = setInterval(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);

      stopTimer.current = setTimeout(stopAndRecognize, LISTEN_SECONDS * 1000);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't start listening. Check microphone access and try again."));
      setPhase('idle');
    }
  }

  async function stopAndRecognize() {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    setPhase('analyzing');

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording captured');
      const job = await recognitionsApi.recognizeClip(uri, 'clip.m4a', 'audio/m4a', mode);
      setMatch(job);
      setPhase('result');
      addScan({
        matched: job.stage_label === 'matched',
        title: job.match_title,
        artist: job.match_artist,
        thumbnailUrl: job.match_thumbnail_url,
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't reach the recognition service. Check your connection and try again."));
      setPhase('idle');
    }
  }

  function reset() {
    setPhase('idle');
    setMatch(null);
    setDownloadJob(null);
    setError(null);
  }

  async function manualSearch() {
    const q = manualQuery.trim();
    if (!q || downloadJob?.status === 'pending' || downloadJob?.status === 'in_progress') return;
    try {
      const job = await downloadsApi.createDownload(`ytsearch1:${q} official audio`, 'audio');
      setDownloadJob(job);
      unsubscribeDownload.current = watchJob(job.id, (update) => {
        setDownloadJob(update);
        if (update.status === 'complete' && update.result_media) {
          upsertMedia(update.result_media);
          toast('Added to your library', 'success');
        }
      });
    } catch (err) {
      toast(apiErrorMessage(err, "Couldn't start that search."), 'error');
    }
  }

  async function findAndDownload() {
    if (!match?.match_title || !match?.match_artist) return;
    const query = `ytsearch1:${match.match_artist} ${match.match_title} official audio`;
    const job = await downloadsApi.createDownload(query, 'audio');
    setDownloadJob(job);
    unsubscribeDownload.current = watchJob(job.id, (update) => {
      setDownloadJob(update);
      if (update.status === 'complete' && update.result_media) {
        upsertMedia(update.result_media);
      }
    });
  }

  const orbState = phase === 'listening' ? 'listening' : phase === 'analyzing' ? 'listening' : 'idle';
  const amplitude = phase === 'listening' ? meteringToAmplitude(recorderState.metering) : phase === 'analyzing' ? 0.4 : 0;
  const micActive = phase === 'listening' || phase === 'analyzing';
  const downloadBusy = downloadJob?.status === 'pending' || downloadJob?.status === 'in_progress';

  const ringRadius = (RING_SIZE - RING_STROKE) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  const pulseStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.5, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
  });

  // Live waveform: re-renders arrive every 100ms from the recorder state poll,
  // so plain Views dance with the real mic level — no extra timers needed.
  const wavePhase = Date.now() / 150;
  return (
    <View style={styles.root}>
      {isFocused && <RippleField />}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { opacity: bgShift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) },
        ]}
      >
        <LinearGradient colors={gradients.screenListening} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View pointerEvents="box-none" style={[styles.triggerHolder, { top: insets.top + spacing.md }]}>
        <SidebarTrigger size={38} />
      </View>

      <View
        style={[
          styles.content,
          isDesktop && styles.contentDesktop,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + bottomChromeClearance + spacing.md,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>IDENTIFY MUSIC</Text>
          {phase === 'idle' && (
            <Text style={styles.megaTitle}>{mode === 'humming' ? 'Hum a melody' : 'What’s playing?'}</Text>
          )}
          {phase === 'listening' && <Text style={styles.megaSolid}>Listening…</Text>}
          {phase === 'analyzing' && <Text style={styles.megaSolid}>Analyzing…</Text>}
          {phase === 'result' && (
            <Text style={styles.megaSolid}>{match?.stage_label === 'matched' ? 'Got it.' : 'Hmm…'}</Text>
          )}
          {phase === 'idle' ? (
            <View style={styles.modeBlock}>
              <SegmentedControl
                accessibilityLabel="Recognition method"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'recording', label: 'Playing nearby', icon: 'radio-outline' },
                  {
                    value: 'humming',
                    label: 'Hum or sing',
                    icon: 'mic-outline',
                    disabled: capabilities?.humming !== true,
                  },
                ]}
              />
              {capabilities?.humming === false ? (
                <Text style={styles.capabilityHint}>
                  Hum or sing becomes available when ACRCloud is connected by the server owner.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.buttonZone}>
          {phase === 'idle' && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.idleOrbit,
                { transform: [{ rotate: idleSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
              ]}
            >
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={(RING_SIZE - RING_STROKE) / 2}
                  stroke="rgba(99,214,181,0.35)"
                  strokeWidth={1.5}
                  strokeDasharray="3 16"
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </Animated.View>
          )}
          <Animated.View style={[styles.pulseRing, pulseStyle(pulseA)]} />
          <Animated.View style={[styles.pulseRing, pulseStyle(pulseB)]} />

          {phase === 'listening' && (
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.countdownRing}>
              <Defs>
                <SvgLinearGradient id="scan-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.cyan} />
                  <Stop offset="100%" stopColor={colors.violet} />
                </SvgLinearGradient>
              </Defs>
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={ringRadius}
                stroke="url(#scan-ring)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                strokeDashoffset={ringAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, ringCircumference],
                })}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
          )}

          <PressableScale
            onPress={phase === 'idle' ? startListening : phase === 'listening' ? stopAndRecognize : undefined}
            disabled={phase === 'analyzing' || phase === 'result'}
            accessibilityLabel={phase === 'idle' ? (mode === 'humming' ? 'Start recording a hummed melody' : 'Start listening') : phase === 'listening' ? 'Stop and identify song' : phase === 'analyzing' ? 'Identifying song' : 'Recognition result shown'}
            scaleTo={0.96}
          >
            <View style={styles.listenShadow}>
              <LinearGradient
                colors={micActive ? colors.gradientPrimary : ['rgba(99,214,181,0.4)', 'rgba(169,155,219,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.listenRing}
              >
                <View style={styles.listenInner}>
                  {isFocused && <Starwell state={orbState} amplitude={amplitude} size={BUTTON_SIZE - 46} />}
                </View>
              </LinearGradient>
            </View>
          </PressableScale>
        </View>

        <View style={styles.footer}>
          {phase === 'idle' && (
            <>
              <Text style={styles.subtitle}>
                {mode === 'humming'
                  ? 'Hum or sing the clearest part of the melody for up to 15 seconds.'
                  : isDesktop
                    ? 'Play the song nearby, then click to listen.'
                    : 'Hold your phone near the music, then tap to listen.'}
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {scanHistory.length > 0 && (
                <View style={styles.historyBlock}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>RECENT SCANS</Text>
                    <Pressable onPress={clearScans} accessibilityRole="button" accessibilityLabel="Clear recent identifications" hitSlop={8}>
                      <Text style={styles.historyClear}>Clear</Text>
                    </Pressable>
                  </View>
                  {scanHistory.slice(0, 4).map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <Ionicons
                        name={entry.matched ? 'checkmark-circle' : 'help-circle'}
                        size={15}
                        color={entry.matched ? colors.success : colors.textMuted}
                      />
                      <Text numberOfLines={1} style={styles.historyText}>
                        {entry.matched ? `${entry.title} — ${entry.artist}` : 'No match'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {phase === 'listening' && (
            <>
              <View style={styles.waveRow}>
                {Array.from({ length: WAVE_BARS }, (_, i) => {
                  const swing = Math.abs(Math.sin(i * 1.37 + wavePhase));
                  const height = 5 + (0.12 + amplitude * 0.88) * swing * 34;
                  return <View key={i} style={[styles.waveBar, { height }]} />;
                })}
              </View>
              <Text style={styles.countdownText}>{countdown}s — tap the orb to stop early</Text>
            </>
          )}

          {phase === 'analyzing' && <ActivityIndicator color={colors.cyan} />}

          {phase === 'result' && match && (
            <View style={styles.resultBlock}>
              {match.stage_label === 'matched' ? (
                <>
                  <GlassPanel style={styles.resultPanel}>
                    <View style={styles.resultContent}>
                      <Artwork
                        media={{
                          id: match.id,
                          title: match.match_title,
                          artist: match.match_artist,
                          thumbnail_url: match.match_thumbnail_url,
                        }}
                        size={72}
                        borderRadius={radii.md}
                        priority
                      />
                      <View style={styles.resultText}>
                        <Text numberOfLines={2} style={styles.resultTitle}>{match.match_title}</Text>
                        <Text numberOfLines={1} style={styles.resultArtist}>{match.match_artist}</Text>
                      </View>
                    </View>
                    {downloadJob && (
                      <View style={styles.downloadZone}>
                        {downloadJob.status === 'complete' ? (
                          <View style={styles.downloadRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            <Text style={styles.resultArtist}>Added to your library</Text>
                          </View>
                        ) : downloadJob.status === 'failed' ? (
                          <Text style={[styles.resultArtist, styles.error]}>{friendlyJobError(downloadJob.error_message)}</Text>
                        ) : (
                          <>
                            <ProgressBar progress={downloadJob.progress_pct / 100} />
                            <View style={styles.downloadRow}>
                              <ActivityIndicator size="small" color={colors.cyan} />
                              <Text style={styles.resultArtist}>{friendlyJobStage(downloadJob.stage_label, downloadJob.status)}…</Text>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </GlassPanel>
                  {!downloadJob && <Button label="Add to library" onPress={findAndDownload} style={styles.wide} />}
                </>
              ) : (
                <>
                  <Text style={styles.subtitle}>
                    {mode === 'humming'
                      ? 'No melody match — try a clearer chorus, or search by name:'
                      : 'No match — get closer to the source, or search by name:'}
                  </Text>
                  <View style={styles.manualRow}>
                    <TextInput
                      value={manualQuery}
                      onChangeText={setManualQuery}
                      placeholder="Song title or artist"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.cyan}
                      style={styles.manualInput}
                      onSubmitEditing={manualSearch}
                    />
                    <PressableScale onPress={manualSearch} disabled={!manualQuery.trim() || downloadBusy} accessibilityLabel={downloadBusy ? 'Searching for song' : 'Search and add song'} accessibilityHint={!manualQuery.trim() ? 'Enter a song title or artist first' : undefined} scaleTo={0.9}>
                      <LinearGradient
                        colors={colors.gradientPrimary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.manualGo}
                      >
                        {downloadBusy ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="search" size={18} color={colors.bg} />}
                      </LinearGradient>
                    </PressableScale>
                  </View>
                  {downloadJob && (
                    <GlassPanel style={styles.resultPanel}>
                      <View style={styles.downloadZone}>
                        {downloadJob.status === 'complete' ? (
                          <View style={styles.downloadRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            <Text style={styles.resultArtist}>
                              {downloadJob.result_media?.title ?? 'Added to your library'}
                            </Text>
                          </View>
                        ) : downloadJob.status === 'failed' ? (
                          <Text style={[styles.resultArtist, styles.error]}>{friendlyJobError(downloadJob.error_message)}</Text>
                        ) : (
                          <>
                            <ProgressBar progress={downloadJob.progress_pct / 100} />
                            <View style={styles.downloadRow}>
                              <ActivityIndicator size="small" color={colors.cyan} />
                              <Text style={styles.resultArtist}>{friendlyJobStage(downloadJob.stage_label, downloadJob.status)}…</Text>
                            </View>
                          </>
                        )}
                      </View>
                    </GlassPanel>
                  )}
                </>
              )}
              <Button label="Listen again" variant="ghost" onPress={reset} style={styles.wide} />
            </View>
          )}
        </View>
      </View>
      <MiniPlayerBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  triggerHolder: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  contentDesktop: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 84,
  },
  modeBlock: { width: '100%', maxWidth: 440, gap: spacing.xs, marginTop: spacing.sm },
  capabilityHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.cyan },
  megaTitle: { ...typography.mega, color: colors.textPrimary, textAlign: 'center' },
  megaSolid: { ...typography.mega, color: colors.textPrimary, textAlign: 'center' },
  buttonZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.cyan,
  },
  countdownRing: {
    position: 'absolute',
  },
  idleOrbit: {
    position: 'absolute',
  },
  listenShadow: {
    borderRadius: BUTTON_SIZE / 2,
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  listenRing: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    padding: 3,
  },
  listenInner: {
    flex: 1,
    borderRadius: (BUTTON_SIZE - 6) / 2,
    backgroundColor: 'rgba(5,10,11,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  footer: {
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
  },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
  },
  waveBar: {
    width: 3.5,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
  },
  countdownText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  resultBlock: { width: '100%', gap: spacing.md, alignItems: 'center' },
  resultPanel: { width: '100%' },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  resultCover: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { flex: 1, gap: 4 },
  resultTitle: { ...typography.title, fontSize: 20, lineHeight: 25, color: colors.textPrimary },
  resultArtist: { ...typography.body, color: colors.textMuted },
  downloadZone: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  downloadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wide: { alignSelf: 'stretch' },

  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  manualInput: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 6,
  },
  manualGo: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBlock: {
    alignSelf: 'stretch',
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.stroke,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTitle: { ...typography.eyebrow, fontSize: 10, letterSpacing: 2, color: colors.textMuted },
  historyClear: { ...typography.caption, fontSize: 12, color: colors.cyan },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
});
