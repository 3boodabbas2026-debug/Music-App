# Wavecairn — Frontend

React Native (Expo) client: paste-a-link downloader, Shazam-style recognition, and a Spotify-style
library/player — all built around a single signature 3D "Orb" (audio-reactive via `@react-three/fiber`
+ `expo-gl`) that changes character across idle / listening / playing states.

## Setup

Dependencies are already installed. Copy `.env.example` to `.env` and point it at your backend:

```
EXPO_PUBLIC_API_BASE_URL=http://<your-pc-lan-ip>:8095
```

Physical devices and most emulators can't reach `127.0.0.1` on your dev machine — you need your PC's
actual LAN IP (`ipconfig`), matching the backend started with `--host 0.0.0.0`. Android emulators
specifically can also use `10.0.2.2`.

## Run

```powershell
npx expo start
```

Scan the QR code with **Expo Go** (works out of the box — everything here, including the GL-based Orb
and mic recording, runs in Expo Go; nothing needs a custom dev client build).

## What's implemented

- **Auth**: login/register screens, JWT stored via AsyncStorage, auto-refresh on 401.
- **Home tab**: paste a link, pick audio/video, live progress via the backend's WebSocket (falls back
  gracefully if the socket drops — the job was already created via the POST response).
- **Recognize tab**: real microphone capture (`expo-audio`), an 8s listening window, calls the backend's
  recognition endpoint, and — the cross-feature payoff — a "Find & download" button that fires a
  `ytsearch1:` yt-dlp query for the matched title/artist straight into the download pipeline.
- **Library tab**: search, list, tap to play.
- **Player**: full-screen Orb, real playback-position seek bar, play/pause.
- **Orb** (`src/components/three/Orb.tsx`): one 3D component reused everywhere. Its `amplitude` prop is
  **real signal, not simulated** — RMS of live mic PCM frames while listening, RMS of the audio player's
  own `audioSampleUpdate` PCM frames while playing (see `PlayerService.ts`). There's no true per-frequency
  FFT split (that would need a native analyser module beyond what Expo Go offers), so the visual motion
  is a layered-sine treatment of that one real amplitude value, not four/eight independent bands.

## Honesty check on testing

I verified this compiles and bundles cleanly: `npx tsc --noEmit` is clean, and `npx expo export
--platform android` successfully bundled all 1415 modules with no errors. I could **not** verify runtime
behavior on an actual device/emulator or simulator from this environment — no Android/iOS tooling was
available here, so I never saw the Orb actually render, watched a real recording round-trip on-device, or
confirmed the seek bar visually. Please run it on your phone via Expo Go and sanity-check the three flows
above (paste-link → progress → library; mic → recognize → find & download; library → player → seek)
before treating it as done-done. The backend side of every one of these flows was independently verified
against the real network (see backend README).

## Notable library choices

- `expo-audio` (not the deprecated `expo-av`) for both playback and mic recording — current SDK-matched
  package.
- `@react-three/fiber/native` + `expo-gl` for the Orb — works in plain Expo Go, no dev-client/eject
  needed. A WebView + web-Three.js hybrid was considered for richer shader effects but adds bridge
  latency; this native path was chosen to keep audio-reactive timing tight.
- `zustand` over Redux — less boilerplate for a project this size.
