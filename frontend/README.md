# Duskglen frontend

Expo 57 / React Native Web client shipped as a production web bundle inside a
Capacitor Android shell. Duskglen captures media links, identifies nearby
music, organizes a private library, and provides queue, lyrics, offline, and
background playback controls.

## Runtime model

The APK runs `expo export --platform web` inside Capacitor. Code should be
optimized for a mobile WebView first, while remaining compatible with Expo's
native preview where practical.

- Avoid expensive backdrop blur and permanent animation loops.
- Keep collection views virtualized.
- Subscribe to high-frequency player state only where it is rendered.
- Use the shared `Artwork` component for remote covers and posters.
- Use semantic tokens and shared controls from `src/theme` and
  `src/components/ui`.

## Setup

Create `frontend/.env` from `.env.example` and point it at the API:

```env
EXPO_PUBLIC_API_BASE_URL=http://<your-pc-lan-ip>:8095
```

Physical devices cannot use your computer's `127.0.0.1`. Use the computer's
LAN address, or `10.0.2.2` from an Android emulator.

## Commands

```powershell
npm install
npm run typecheck
npm run build:web
npm run test:smoke
npm run build:android-web
```

`build:android-web` exports the web app and synchronizes the Capacitor Android
project. Production APKs are built by `.github/workflows/android-apk.yml` only
after typechecking, a production export, and the 390×844 Playwright smoke suite
pass.

## Product structure

- **Today** — link capture, active work, resume, and recently added music.
- **Library** — search, filters, favorites, playlists, bulk actions, and offline saves.
- **Identify** — microphone recognition with explicit recovery and add-to-library flow.
- **Activity** — download/recognition progress, cancel, retry, and history.
- **Player** — artwork-led playback, queue, synced lyrics, repeat/shuffle, sleep, and lock-screen metadata.
- **Secondary tools** — Telegram import, Replay, Settings, and role-gated Admin.

See [`../docs/PRODUCT_REBUILD.md`](../docs/PRODUCT_REBUILD.md) for the product,
design-system, and feature decisions behind the current architecture.

## Notable choices

- `expo-audio` for playback and microphone capture.
- `expo-image` for cached, recyclable, flicker-free artwork.
- Zustand stores with narrow selectors for playback-sensitive surfaces.
- React Navigation for the four-destination shell and secondary stack.
- Static ambient backgrounds; motion is reserved for direct interaction and playback state.
