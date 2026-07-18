import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { File } from 'expo-file-system';
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
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsive } from '../hooks/useResponsive';
import { RippleField } from '../components/ui/RippleField';
import { Button } from '../components/ui/Button';
import { GlassPanel } from '../components/ui/GlassPanel';
import { Artwork } from '../components/ui/Artwork';
import { CompactGlassSheet } from '../components/ui/CompactGlassSheet';
import { ContinuityFrame } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/TextField';
import { RecoverableError } from '../components/ui/FormError';
import { ConnectionSignal } from '../components/library/LibraryFreshnessBanner';
import { PressableScale } from '../components/ui/PressableScale';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SidebarTrigger } from '../components/ui/SidebarTrigger';
import * as downloadsApi from '../services/api/downloads';
import { watchJob } from '../services/api/jobSocket';
import * as recognitionsApi from '../services/api/recognitions';
import type { Job } from '../services/api/types';
import { useLibraryStore } from '../store/libraryStore';
import { useRecognitionCaptureStore } from '../store/recognitionCaptureStore';
import { SCAN_HISTORY_LIMIT, type ScanEntry, useScanHistoryStore } from '../store/scanHistoryStore';
import { toast } from '../store/toastStore';
import { apiErrorMessage, friendlyJobError, friendlyJobStage } from '../utils/apiError';
import { colors, glass, gradients, motion, numericTypography, radii, spacing, stateLayers, typography } from '../theme/tokens';

const LISTEN_SECONDS = 15;

const BUTTON_SIZE = 208;
const RING_SIZE = BUTTON_SIZE + 26;
const RING_STROKE = 3.5;
const PULSE_SIZE = BUTTON_SIZE + 26;
const WAVE_BARS = 26;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Phase = 'idle' | 'listening' | 'analyzing' | 'result';
type CapabilityState = 'loading' | 'ready' | 'error';
type CandidateSource = 'match' | 'manual' | 'history';

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'Duration unavailable';
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function discardClipFile(uri: string | null) {
  if (!uri) return;
  try {
    if (Platform.OS === 'web') {
      URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort; stopping the microphone is the priority.
  }
}

function meteringToAmplitude(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  return Math.max(0, Math.min(1, (metering + 60) / 60));
}

function CandidateSkeleton() {
  const reduceMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    sweep.stopAnimation();
    if (reduceMotion) { sweep.setValue(0.3); return; }
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: motion.duration.continuous, easing: Easing.inOut(Easing.sin), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep]);
  return (
    <View style={styles.candidateList} accessibilityRole="progressbar" accessibilityLabel="Finding source candidates">
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.candidateSkeleton}>
          <View style={styles.candidateSkeletonArt} />
          <View style={styles.candidateSkeletonCopy}>
            <View style={[styles.skeletonTone, styles.candidateSkeletonTitle]} />
            <View style={[styles.skeletonTone, styles.candidateSkeletonMeta]} />
            <View style={[styles.skeletonTone, styles.candidateSkeletonAction]} />
          </View>
          <Animated.View pointerEvents="none" style={[styles.candidateSkeletonSweep, { opacity: reduceMotion ? 0.1 : 0.18, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, 620] }) }] }]} />
        </View>
      ))}
    </View>
  );
}

export function RecognitionScreen() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const bottomChromeClearance = useBottomChromeClearance();
  const reduceMotion = useReducedMotion();
  const { networkOnline, backendOnline } = useOnlineStatus();
  const offline = !networkOnline || backendOnline === false;
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
  const captureActive = useRef(false);
  const submitActive = useRef(false);
  const captureGeneration = useRef(0);
  const candidateRequestGeneration = useRef(0);
  const mounted = useRef(true);
  const focusedRef = useRef(isFocused);
  const cleanupCaptureRef = useRef<(showConfirmation?: boolean) => Promise<void>>(async () => undefined);
  const upsertMedia = useLibraryStore((s) => s.upsert);
  const scanHistory = useScanHistoryStore((s) => s.entries);
  const addScan = useScanHistoryStore((s) => s.add);
  const clearScans = useScanHistoryStore((s) => s.clear);
  const hydrateScans = useScanHistoryStore((s) => s.hydrate);
  const captureStatus = useRecognitionCaptureStore((s) => s.status);
  const setCaptureStatus = useRecognitionCaptureStore((s) => s.setStatus);
  const [manualQuery, setManualQuery] = useState('');
  const [mode, setMode] = useState<recognitionsApi.RecognitionMode>('recording');
  const [capabilities, setCapabilities] = useState<recognitionsApi.RecognitionCapabilities | null>(null);
  const [capabilityState, setCapabilityState] = useState<CapabilityState>('loading');
  const [historyVisible, setHistoryVisible] = useState(false);
  const [candidateVisible, setCandidateVisible] = useState(false);
  const [candidateSource, setCandidateSource] = useState<CandidateSource>('manual');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<downloadsApi.DownloadSearchCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<downloadsApi.DownloadSearchCandidate | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importSubmitting = useRef(false);
  focusedRef.current = isFocused;

  const pulseA = useRef(new Animated.Value(0)).current;
  const pulseB = useRef(new Animated.Value(0)).current;
  const bgShift = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const idleSpin = useRef(new Animated.Value(0)).current;
  const phaseMorph = useRef(new Animated.Value(0)).current;
  const analysisTravel = useRef(new Animated.Value(0)).current;

  // A slow dashed orbit around the button while idle — invites the tap.
  useEffect(() => {
    if (!isFocused || reduceMotion || phase !== 'idle') {
      idleSpin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(idleSpin, { toValue: 1, duration: 26000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [idleSpin, isFocused, phase, reduceMotion]);

  async function loadCapabilities() {
    setCapabilityState('loading');
    try {
      const value = await recognitionsApi.getCapabilities();
      if (!mounted.current) return;
      setCapabilities(value);
      setCapabilityState('ready');
      if (!value.humming) setMode('recording');
    } catch {
      if (!mounted.current) return;
      setCapabilities(null);
      setCapabilityState('error');
    }
  }

  useEffect(() => {
    void loadCapabilities();
    void hydrateScans();
  }, []);

  // Sonar pulses + background drift + the 8s countdown ring. Presentation only.
  useEffect(() => {
    if (!isFocused || reduceMotion || (phase !== 'listening' && phase !== 'analyzing')) {
      pulseA.setValue(0);
      pulseB.setValue(0);
      bgShift.setValue(0);
      return;
    }

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
      bgShift.setValue(0);
    };
  }, [bgShift, isFocused, phase, pulseA, pulseB, reduceMotion]);

  useEffect(() => {
    if (phase === 'listening' && !reduceMotion) {
      ringAnim.setValue(0);
      const animation = Animated.timing(ringAnim, {
        toValue: 1,
        duration: LISTEN_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.start();
      return () => animation.stop();
    }
    ringAnim.setValue(0);
    return undefined;
  }, [phase, reduceMotion, ringAnim]);

  useEffect(() => {
    const phaseIndex: Record<Phase, number> = { idle: 0, listening: 1, analyzing: 2, result: 3 };
    const target = phaseIndex[phase];
    phaseMorph.stopAnimation();
    if (reduceMotion) {
      phaseMorph.setValue(target);
      return;
    }
    Animated.timing(phaseMorph, {
      toValue: target,
      duration: phase === 'result' ? motion.duration.slow : motion.duration.base,
      easing: Easing.bezier(...motion.easing.standard),
      useNativeDriver: true,
    }).start();
  }, [phase, phaseMorph, reduceMotion]);

  useEffect(() => {
    analysisTravel.stopAnimation();
    if (phase !== 'analyzing' || reduceMotion) {
      analysisTravel.setValue(phase === 'analyzing' ? 0.5 : 0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(analysisTravel, {
        toValue: 1,
        duration: motion.duration.continuous,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [analysisTravel, phase, reduceMotion]);

  function clearCaptureTimers() {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    tickTimer.current = null;
    stopTimer.current = null;
  }

  async function cleanupCapture(showConfirmation = false) {
    const hadCapture = captureActive.current || recorder.isRecording || !!recorder.uri;
    captureGeneration.current += 1;
    clearCaptureTimers();
    if (!hadCapture) return;

    setCaptureStatus('cleaning_up');
    try {
      if (captureActive.current || recorder.isRecording) await recorder.stop();
    } catch {
      // A recorder can already be stopped by an overlapping timer callback.
    } finally {
      captureActive.current = false;
      discardClipFile(recorder.uri);
      setCaptureStatus('idle');
      if (mounted.current) {
        setPhase('idle');
        setCountdown(LISTEN_SECONDS);
        if (showConfirmation) toast('Recording canceled and discarded', 'success');
      }
    }
  }
  cleanupCaptureRef.current = cleanupCapture;

  useEffect(() => {
    if (!isFocused) void cleanupCaptureRef.current(false);
  }, [isFocused]);

  useEffect(
    () => () => {
      mounted.current = false;
      void cleanupCaptureRef.current(false);
      unsubscribeDownload.current?.();
    },
    [],
  );

  async function startListening() {
    if (captureStatus !== 'idle' || submitActive.current) return;
    if (offline) {
      setError('Identify needs the Starhollow server. Cached music remains available while you reconnect.');
      return;
    }
    const generation = captureGeneration.current + 1;
    captureGeneration.current = generation;
    setError(null);
    setMatch(null);
    setDownloadJob(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mounted.current || !focusedRef.current || generation !== captureGeneration.current) return;
      if (!permission.granted) {
        setError('Microphone access is required to identify songs.');
        return;
      }

      await recorder.prepareToRecordAsync();
      if (!mounted.current || !focusedRef.current || generation !== captureGeneration.current) {
        void cleanupCaptureRef.current(false);
        return;
      }
      recorder.record();
      captureActive.current = true;
      setCaptureStatus('recording');
      setPhase('listening');
      setCountdown(LISTEN_SECONDS);

      tickTimer.current = setInterval(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);

      stopTimer.current = setTimeout(stopAndRecognize, LISTEN_SECONDS * 1000);
    } catch (err) {
      if (!mounted.current || generation !== captureGeneration.current) return;
      setError(apiErrorMessage(err, "Couldn't start listening. Check microphone access and try again."));
      setPhase('idle');
    }
  }

  async function stopAndRecognize() {
    if (!captureActive.current || submitActive.current) return;
    submitActive.current = true;
    const generation = captureGeneration.current;
    clearCaptureTimers();
    setPhase('analyzing');
    setCaptureStatus('cleaning_up');
    let uri: string | null = null;

    try {
      await recorder.stop();
      captureActive.current = false;
      uri = recorder.uri;
      if (!uri) throw new Error('No recording captured');
      const job = await recognitionsApi.recognizeClip(uri, 'clip.m4a', 'audio/m4a', mode);
      if (!mounted.current || generation !== captureGeneration.current) return;
      setMatch(job);
      setPhase('result');
      addScan({
        matched: job.stage_label === 'matched',
        title: job.match_title,
        artist: job.match_artist,
        thumbnailUrl: job.match_thumbnail_url,
      });
    } catch (err) {
      if (!mounted.current || generation !== captureGeneration.current) return;
      setError(apiErrorMessage(err, "Couldn't reach the recognition service. Check your connection and try again."));
      setPhase('idle');
    } finally {
      captureActive.current = false;
      discardClipFile(uri ?? recorder.uri);
      if (generation === captureGeneration.current) setCaptureStatus('idle');
      submitActive.current = false;
    }
  }

  async function cancelListening() {
    await cleanupCapture(true);
  }

  function reset() {
    setPhase('idle');
    setMatch(null);
    setDownloadJob(null);
    setError(null);
    setImportError(null);
    setSelectedCandidate(null);
  }

  async function loadCandidates(query = candidateQuery) {
    const q = query.trim();
    if (!q) return;
    const requestGeneration = candidateRequestGeneration.current + 1;
    candidateRequestGeneration.current = requestGeneration;
    setCandidateLoading(true);
    setCandidateError(null);
    setCandidates([]);
    try {
      const results = await downloadsApi.searchDownloadCandidates(q, 5);
      if (requestGeneration !== candidateRequestGeneration.current) return;
      setCandidates(results);
      if (results.length === 0) setCandidateError('No safe candidates were returned. Try a more specific title and artist.');
    } catch (err) {
      if (requestGeneration !== candidateRequestGeneration.current) return;
      setCandidateError(apiErrorMessage(err, "Couldn't load candidates. Check your connection and retry."));
    } finally {
      if (requestGeneration === candidateRequestGeneration.current) setCandidateLoading(false);
    }
  }

  function openCandidateSearch(query: string, source: CandidateSource) {
    const q = query.trim();
    if (!q) return;
    setCandidateSource(source);
    setCandidateQuery(q);
    setCandidateVisible(true);
    setSelectedCandidate(null);
    setImportError(null);
    setDownloadJob(null);
    void loadCandidates(q);
  }

  function manualSearch() {
    setHistoryVisible(false);
    openCandidateSearch(manualQuery, 'manual');
  }

  function findAndDownload() {
    if (!match?.match_title || !match?.match_artist) return;
    openCandidateSearch(`${match.match_artist} ${match.match_title} official audio`, 'match');
  }

  function addHistoryMatch(entry: ScanEntry) {
    if (!entry.title || !entry.artist) return;
    setHistoryVisible(false);
    openCandidateSearch(`${entry.artist} ${entry.title} official audio`, 'history');
  }

  async function downloadCandidate(candidate: downloadsApi.DownloadSearchCandidate) {
    if (importSubmitting.current || downloadBusy) return;
    importSubmitting.current = true;
    setSelectedCandidate(candidate);
    setImportError(null);
    unsubscribeDownload.current?.();
    try {
      const job = await downloadsApi.createDownload(candidate.url, 'audio');
      setDownloadJob(job);
      unsubscribeDownload.current = watchJob(job.id, (update) => {
        setDownloadJob(update);
        if (update.status === 'complete' && update.result_media) {
          upsertMedia(update.result_media);
          setImportError(null);
          toast('Added to your library', 'success');
        } else if (update.status === 'failed') {
          setImportError(friendlyJobError(update.error_message));
        }
      });
    } catch (err) {
      setImportError(apiErrorMessage(err, "Couldn't add this candidate. Your match is still here — retry when ready."));
    } finally {
      importSubmitting.current = false;
    }
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
  const wavePhase = reduceMotion ? 0 : Date.now() / 150;
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
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.captureVignette,
          { opacity: phaseMorph.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, 0.44, 0.52, 0] }) },
        ]}
      />

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
            <GlassPanel variant="quiet" style={styles.modeShelf}>
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
                    disabled: capabilityState !== 'ready' || capabilities?.humming !== true,
                  },
                ]}
              />
              {capabilityState === 'loading' ? (
                <View style={styles.capabilityStatus} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={colors.cyan} />
                  <Text style={styles.capabilityHint}>Checking recognition services…</Text>
                </View>
              ) : capabilityState === 'error' ? (
                <View style={styles.capabilityError} accessibilityLiveRegion="polite">
                  <Text style={styles.capabilityHint}>
                    Recognition service status could not be reached. Nearby listening may still work; humming availability is unknown.
                  </Text>
                  <Button label="Retry service check" variant="ghost" onPress={() => void loadCapabilities()} style={styles.compactButton} />
                </View>
              ) : capabilities?.humming === false ? (
                <Text style={styles.capabilityHint}>
                  Nearby listening is ready. Hum or sing becomes available when ACRCloud is connected by the server owner.
                </Text>
              ) : null}
              </View>
            </GlassPanel>
          ) : null}
        </View>

        <Animated.View
          style={[
            styles.buttonZone,
            micActive && styles.captureTheatre,
            {
              transform: [
                { scale: phaseMorph.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, 1.035, 0.87, 0.94] }) },
                { translateY: phaseMorph.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0, -2, 5, 2] }) },
              ],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.phaseHalo,
              {
                opacity: phaseMorph.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0.18, 0.72, 0.42, 0.24] }),
                transform: [{ scale: phaseMorph.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, 1.1, 0.82, 0.92] }) }],
              },
            ]}
          />
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
                <Circle cx={RING_SIZE / 2} cy={7} r={2.5} fill={colors.gold} />
                <Circle cx={RING_SIZE - 7} cy={RING_SIZE / 2} r={1.8} fill={colors.cyan} />
                <Circle cx={RING_SIZE / 2} cy={RING_SIZE - 7} r={1.5} fill={colors.textPrimary} />
                <Circle cx={7} cy={RING_SIZE / 2} r={1.8} fill={colors.cyan} />
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
            onPress={phase === 'idle' && !offline ? startListening : phase === 'listening' ? stopAndRecognize : undefined}
            disabled={offline || phase === 'analyzing' || phase === 'result' || captureStatus === 'cleaning_up'}
            accessibilityLabel={offline ? 'Identify unavailable while the server is offline' : phase === 'idle' ? (mode === 'humming' ? 'Start recording a hummed melody' : 'Start listening') : phase === 'listening' ? 'Stop and identify song' : phase === 'analyzing' ? 'Identifying song' : 'Recognition result shown'}
            accessibilityHint={offline ? 'Reconnect to the Starhollow server. Cached library playback remains available.' : undefined}
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
        </Animated.View>

        <ContinuityFrame stateKey={phase} minHeight={220} style={styles.footerContinuity}>
        <View style={styles.footer}>
          {phase === 'idle' && (
            <>
              {offline ? (
                <ConnectionSignal
                  compact
                  title="Identify pauses while offline"
                  detail="Reconnect before recording so a 15-second clip is never captured for a server that cannot receive it."
                  timestamp="Saved browsing and playback data is still usable."
                />
              ) : null}
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
                    <View>
                      <Text style={styles.historyTitle}>RECENT SCANS</Text>
                      <Text style={styles.historyRetention}>{scanHistory.length} of {SCAN_HISTORY_LIMIT} kept on this device</Text>
                    </View>
                    <Pressable onPress={() => setHistoryVisible(true)} accessibilityRole="button" accessibilityLabel="View all recent identifications" hitSlop={8}>
                      <Text style={styles.historyClear}>View all</Text>
                    </Pressable>
                  </View>
                  {scanHistory.slice(0, 3).map((entry) => (
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
                  const energy = reduceMotion ? 0.22 : 0.12 + amplitude * 0.88;
                  const height = 5 + energy * swing * 34;
                  return <View key={i} style={[styles.waveBar, { height }]} />;
                })}
              </View>
              <View style={styles.captureReadout}>
                <Text style={styles.captureTimer}>0:{String(countdown).padStart(2, '0')}</Text>
                <View style={styles.captureReadoutRule} />
                <Text style={styles.countdownText}>tap the orb to identify</Text>
              </View>
              <Button
                label="Cancel and discard"
                icon="trash-outline"
                variant="danger"
                onPress={() => void cancelListening()}
                style={styles.cancelButton}
              />
            </>
          )}

          {phase === 'analyzing' && (
            <View style={styles.analysisBlock} accessibilityLiveRegion="polite">
              <View style={styles.analysisSignal}>
                <View style={styles.analysisBaseline} />
                <Animated.View
                  style={[
                    styles.analysisPacket,
                    { transform: [{ translateX: analysisTravel.interpolate({ inputRange: [0, 1], outputRange: [0, 170] }) }] },
                  ]}
                />
              </View>
              <Text style={styles.analysisLabel}>Following the captured signal…</Text>
            </View>
          )}

          {phase === 'result' && match && (
            <Animated.View
              style={[
                styles.resultBlock,
                {
                  opacity: phaseMorph.interpolate({ inputRange: [2, 3], outputRange: [0, 1], extrapolate: 'clamp' }),
                  transform: [{ translateY: phaseMorph.interpolate({ inputRange: [2, 3], outputRange: [10, 0], extrapolate: 'clamp' }) }],
                },
              ]}
            >
              {match.stage_label === 'matched' ? (
                <>
                  <GlassPanel style={[styles.resultPanel, styles.resultCollectible]}>
                    <LinearGradient pointerEvents="none" colors={gradients.celebratorySheen} style={styles.resultSheen} />
                    <View style={styles.resultContent}>
                      <Artwork
                        media={{
                          id: match.id,
                          title: match.match_title,
                          artist: match.match_artist,
                          thumbnail_url: match.match_thumbnail_url,
                        }}
                        size={104}
                        borderRadius={radii.cover}
                        priority
                      />
                      <View style={styles.resultText}>
                        <View style={styles.identifiedSeal}>
                          <Ionicons name="sparkles" size={12} color={colors.gold} />
                          <Text style={styles.identifiedSealText}>IDENTIFIED</Text>
                        </View>
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
                  {!downloadJob && <Button label="Review sources" icon="albums-outline" onPress={findAndDownload} style={styles.wide} />}
                  {importError && selectedCandidate ? (
                    <View style={styles.retryBlock}>
                      <Text style={styles.error}>{importError}</Text>
                      <Button
                        label="Retry selected source"
                        icon="refresh-outline"
                        onPress={() => void downloadCandidate(selectedCandidate)}
                        loading={importSubmitting.current}
                        disabled={downloadBusy}
                        style={styles.wide}
                      />
                      <Button label="Choose another source" variant="ghost" onPress={findAndDownload} style={styles.wide} />
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.subtitle}>
                    {mode === 'humming'
                      ? 'No melody match — try a clearer chorus, or search by name:'
                      : 'No match — get closer to the source, or search by name:'}
                  </Text>
                  <View style={styles.manualRow}>
                    <TextField
                      value={manualQuery}
                      onChangeText={setManualQuery}
                      placeholder="Song title or artist"
                      leadingIcon="search"
                      compact
                      style={styles.manualInput}
                      containerStyle={styles.manualField}
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
            </Animated.View>
          )}
        </View>
        </ContinuityFrame>
      </View>
      <CompactGlassSheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        accessibilityLabel="Identification history"
        scrollable
        maxWidth={560}
        header={
          <View>
            <Text style={styles.sheetTitle}>Identification history</Text>
            <Text style={styles.sheetSubtitle}>The latest {SCAN_HISTORY_LIMIT} scans are kept on this device. Older scans roll off automatically.</Text>
          </View>
        }
      >
        <View style={styles.historySearchRow}>
          <TextField
            value={manualQuery}
            onChangeText={setManualQuery}
            placeholder="Search title or artist"
            leadingIcon="search"
            compact
            style={styles.manualInput}
            containerStyle={styles.manualField}
            onSubmitEditing={manualSearch}
          />
          <Button label="Search" icon="search-outline" onPress={manualSearch} disabled={!manualQuery.trim()} style={styles.sheetActionButton} />
        </View>
        <View style={styles.historySheetList}>
          {scanHistory.map((entry) => (
            <GlassPanel key={entry.id} style={styles.historySheetRow}>
              <View style={styles.historyIdentity}>
                {entry.matched ? (
                  <Artwork
                    media={{ id: entry.id, title: entry.title, artist: entry.artist, thumbnail_url: entry.thumbnailUrl }}
                    size={52}
                    borderRadius={radii.sm}
                  />
                ) : (
                  <View style={styles.historyUnknown}><Ionicons name="help" size={22} color={colors.textMuted} /></View>
                )}
                <View style={styles.historyDetails}>
                  <Text numberOfLines={1} style={styles.historyEntryTitle}>{entry.matched ? entry.title : 'No match found'}</Text>
                  <Text numberOfLines={1} style={styles.historyEntryMeta}>
                    {entry.matched ? entry.artist : 'Try again closer to the music'} · {new Date(entry.at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <View style={styles.historyActions}>
                {entry.matched ? (
                  <Pressable onPress={() => addHistoryMatch(entry)} accessibilityRole="button" accessibilityLabel={`Find a source for ${entry.title}`}>
                    <Text style={styles.historyAction}>Find & add</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setHistoryVisible(false);
                    void startListening();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Scan again"
                >
                  <Text style={styles.historyAction}>Rescan</Text>
                </Pressable>
              </View>
            </GlassPanel>
          ))}
        </View>
        <Button label="Clear history" icon="trash-outline" variant="danger" onPress={clearScans} style={styles.wide} />
      </CompactGlassSheet>

      <CompactGlassSheet
        visible={candidateVisible}
        onClose={() => setCandidateVisible(false)}
        accessibilityLabel="Choose a download source"
        scrollable
        maxWidth={620}
        header={
          <View>
            <Text style={styles.sheetTitle}>Choose the right recording</Text>
            <Text style={styles.sheetSubtitle}>
              {candidateSource === 'match' ? 'Your identified track is safe while you review.' : 'Nothing downloads until you choose a source.'}
            </Text>
          </View>
        }
      >
        <View style={styles.candidateQueryBlock}>
          <Text style={styles.candidateQueryLabel}>SEARCHING FOR</Text>
          <Text style={styles.candidateQuery}>{candidateQuery}</Text>
        </View>
        {candidateLoading ? (
          <CandidateSkeleton />
        ) : candidateError ? (
          <RecoverableError title="Source search was interrupted" message={candidateError} actionLabel="Retry candidate search" onAction={() => void loadCandidates()} />
        ) : (
          <View style={styles.candidateList}>
            {candidates.map((candidate) => {
              const isSelected = selectedCandidate?.id === candidate.id;
              return (
                <GlassPanel key={candidate.id} style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}>
                  <View pointerEvents="none" style={[styles.candidateSelectionEdge, isSelected && styles.candidateSelectionEdgeActive]} />
                  <View style={styles.candidateIdentity}>
                    <Artwork
                      media={{ id: candidate.id, title: candidate.title, artist: candidate.channel, thumbnail_url: candidate.thumbnail_url }}
                      size={68}
                      borderRadius={radii.md}
                    />
                    <View style={styles.candidateText}>
                      <Text numberOfLines={2} style={styles.candidateTitle}>{candidate.title}</Text>
                      <View style={styles.candidateMetaRow}>
                        <Ionicons name="radio-outline" size={13} color={colors.textMuted} />
                        <Text numberOfLines={1} style={styles.candidateMeta}>{candidate.channel ?? 'Unknown channel'}</Text>
                        <View style={styles.candidateDurationChip}>
                          <Text style={styles.candidateDuration}>{formatDuration(candidate.duration_seconds)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Button
                    label={isSelected && downloadBusy ? 'Adding selected source' : isSelected && downloadJob?.status === 'complete' ? 'Added' : 'Choose this source'}
                    icon={isSelected && downloadJob?.status === 'complete' ? 'checkmark-circle-outline' : 'add-circle-outline'}
                    onPress={() => void downloadCandidate(candidate)}
                    loading={isSelected && downloadBusy}
                    disabled={downloadBusy || (isSelected && downloadJob?.status === 'complete')}
                    style={styles.wide}
                  />
                </GlassPanel>
              );
            })}
          </View>
        )}
        {selectedCandidate && downloadJob && downloadBusy ? (
          <View style={styles.candidateProgress} accessibilityLiveRegion="polite">
            <ProgressBar progress={downloadJob.progress_pct / 100} />
            <Text style={styles.sheetSubtitle}>{friendlyJobStage(downloadJob.stage_label, downloadJob.status)}…</Text>
          </View>
        ) : null}
        {importError && selectedCandidate ? (
          <View style={styles.retryBlock} accessibilityLiveRegion="polite">
            <Text style={styles.error}>{importError}</Text>
            <Button label="Retry selected source" icon="refresh-outline" onPress={() => void downloadCandidate(selectedCandidate)} disabled={downloadBusy} style={styles.wide} />
          </View>
        ) : null}
      </CompactGlassSheet>
      <MiniPlayerBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  captureVignette: { backgroundColor: colors.bg },
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
    minHeight: 72,
  },
  modeShelf: { width: '100%', maxWidth: 460, marginTop: spacing.sm, borderRadius: radii.control },
  modeBlock: { width: '100%', gap: spacing.sm, padding: spacing.sm },
  capabilityHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  capabilityStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  capabilityError: { alignItems: 'center', gap: spacing.sm },
  compactButton: { minHeight: 40, paddingVertical: spacing.sm, alignSelf: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.cyan },
  megaTitle: { ...typography.screenTitle, color: colors.textPrimary, textAlign: 'center' },
  megaSolid: { ...typography.screenTitle, color: colors.textPrimary, textAlign: 'center' },
  buttonZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureTheatre: {
    flex: 0,
    width: '100%',
    minHeight: 316,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.hero,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: glass.fillDeep,
  },
  phaseHalo: {
    position: 'absolute',
    width: BUTTON_SIZE + 46,
    height: BUTTON_SIZE + 46,
    borderRadius: (BUTTON_SIZE + 46) / 2,
    borderWidth: 1,
    borderColor: glass.tintPrimaryStroke,
    backgroundColor: 'rgba(99,214,181,0.035)',
    shadowColor: colors.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
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
  captureReadout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  captureTimer: { ...numericTypography.time, fontSize: 15, lineHeight: 20, color: colors.textPrimary },
  captureReadoutRule: { width: 1, height: 14, backgroundColor: glass.strokeStrong },
  cancelButton: { minHeight: 44, alignSelf: 'center', paddingVertical: spacing.sm },
  analysisBlock: { width: 220, alignItems: 'center', gap: spacing.sm },
  analysisSignal: { width: 184, height: 24, justifyContent: 'center', overflow: 'hidden' },
  analysisBaseline: { height: 1, backgroundColor: glass.strokeStrong },
  analysisPacket: {
    position: 'absolute',
    left: 0,
    width: 14,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  footerContinuity: { alignItems: 'center' },
  analysisLabel: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  resultBlock: { width: '100%', gap: spacing.md, alignItems: 'center' },
  resultPanel: { width: '100%' },
  resultCollectible: { borderRadius: radii.hero, borderColor: glass.tintPrimaryStroke },
  resultSheen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.12 },
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
  resultText: { flex: 1, minWidth: 0, gap: 4 },
  identifiedSeal: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surfaceElevated,
  },
  identifiedSealText: { ...typography.eyebrow, fontSize: 8, lineHeight: 11, color: colors.gold },
  resultTitle: { ...typography.sectionTitle, color: colors.textPrimary },
  resultArtist: { ...typography.body, color: colors.textMuted },
  downloadZone: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
  },
  downloadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wide: { alignSelf: 'stretch' },
  retryBlock: { alignSelf: 'stretch', gap: spacing.sm },
  offlineNotice: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: 'rgba(242,183,93,0.08)', borderWidth: 1, borderColor: 'rgba(242,183,93,0.2)' },
  offlineNoticeCopy: { flex: 1, gap: 3 },
  offlineNoticeTitle: { ...typography.subtitle, fontSize: 14, color: colors.warning },
  offlineNoticeText: { ...typography.caption, color: colors.textSecondary },

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
  manualField: { flex: 1, minWidth: 0 },
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
  historyRetention: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  historyClear: { ...typography.caption, fontSize: 12, color: colors.cyan },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  sheetTitle: { ...typography.title, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  sheetSubtitle: { ...typography.caption, color: colors.textMuted },
  historySearchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sheetActionButton: { minHeight: 46, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  historySheetList: { gap: spacing.sm, marginBottom: spacing.md },
  historySheetRow: { padding: spacing.md, gap: spacing.sm },
  historyIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyUnknown: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: glass.fillDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDetails: { flex: 1, gap: 2 },
  historyEntryTitle: { ...typography.subtitle, fontSize: 14, color: colors.textPrimary },
  historyEntryMeta: { ...typography.caption, color: colors.textMuted },
  historyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: glass.stroke,
    paddingTop: spacing.sm,
  },
  historyAction: { ...typography.caption, color: colors.cyan },
  candidateQueryBlock: {
    backgroundColor: glass.fillDeep,
    borderWidth: 1,
    borderColor: glass.stroke,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
    marginBottom: spacing.md,
  },
  candidateQueryLabel: { ...typography.eyebrow, fontSize: 9, color: colors.textMuted },
  candidateQuery: { ...typography.body, color: colors.textSecondary },
  sheetLoading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  candidateList: { gap: spacing.md },
  candidateSkeleton: { position: 'relative', overflow: 'hidden', minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: stateLayers.skeleton.base, borderWidth: 1, borderColor: glass.stroke },
  candidateSkeletonArt: { width: 68, height: 68, borderRadius: radii.md, backgroundColor: stateLayers.skeleton.raised },
  candidateSkeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTone: { borderRadius: radii.pill, backgroundColor: stateLayers.skeleton.raised },
  candidateSkeletonTitle: { width: '74%', height: 9 },
  candidateSkeletonMeta: { width: '52%', height: 7 },
  candidateSkeletonAction: { alignSelf: 'flex-end', width: 92, height: 28 },
  candidateSkeletonSweep: { position: 'absolute', top: 0, bottom: 0, width: 76, backgroundColor: stateLayers.skeleton.sweep },
  candidateCard: { position: 'relative', padding: spacing.md, gap: spacing.md },
  candidateCardSelected: { borderColor: colors.cyan, backgroundColor: glass.tintPrimary },
  candidateSelectionEdge: { position: 'absolute', left: 0, top: spacing.md, bottom: spacing.md, width: 3, borderRadius: radii.pill, backgroundColor: 'transparent' },
  candidateSelectionEdgeActive: { backgroundColor: colors.cyan },
  candidateIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  candidateText: { flex: 1, gap: 3 },
  candidateTitle: { ...typography.subtitle, color: colors.textPrimary },
  candidateMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  candidateMeta: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  candidateDurationChip: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated },
  candidateDuration: { ...numericTypography.time, color: colors.cyan },
  candidateProgress: { gap: spacing.sm, marginTop: spacing.md },
});
