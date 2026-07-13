# Starhollow Agent Context — Read First

Use this file as the repository map. Do **not** scan the whole repository before starting a task. Read this file, check `git status`, then open only the files named by the task or the relevant paths below. Update this brief when architecture, commands, or major file ownership changes.

## Product and stack

Starhollow is a private music utility for downloading linked media, recognizing songs, organizing a library, and audio/video playback.

- `frontend/`: Expo 57, React Native 0.86, React 19, React Native Web, TypeScript, Zustand, React Navigation. The production web export is packaged in a Capacitor 8 Android shell.
- `backend/`: FastAPI, async SQLAlchemy, SQLite by default (Postgres supported by configuration), yt-dlp, shazamio, Telethon, local or S3-compatible storage.
- API base path: `/api/v1`; health check: `/health`; job progress: WebSocket routes.
- Visual identity: dark forest/night, restrained dusk-editorial, premium and calm. Prefer semantic theme tokens and shared UI components; avoid generic Spotify styling and excessive purple/blur/animation.

## Start work efficiently

1. Run `git status --short` and preserve unrelated user changes.
2. Read the nearest `AGENTS.md` before editing within its directory. In particular, `frontend/AGENTS.md` requires using the exact Expo 57 documentation before writing version-sensitive Expo code.
3. Open the task's direct files plus the smallest relevant set from the map below.
4. Search narrowly with `rg`; do not inventory entire generated folders such as `node_modules`, `dist`, or Android build outputs.
5. Implement and run the proportionate quality gate.

## Frontend map

- Entry/bootstrap: `frontend/App.tsx`, `frontend/index.ts`
- Environment/API URLs: `frontend/src/config.ts`
- Navigation and route types: `frontend/src/navigation/RootNavigator.tsx`, `MainTabs.tsx`, `types.ts`
- Screens: `frontend/src/screens/`; admin is under `screens/admin/`
- Shared UI: `frontend/src/components/ui/`
- Player UI: `frontend/src/components/player/`; global video: `components/video/GlobalVideoStage.tsx`
- Library overlays/views: `frontend/src/components/library/`
- Dashboard customization: `frontend/src/components/dashboard/DashboardCustomizer.tsx`
- Client state: `frontend/src/store/` (Zustand)
- API clients and shared response types: `frontend/src/services/api/`
- Audio playback/media session: `frontend/src/services/audio/`
- Offline/token persistence: `frontend/src/services/storage/`
- Theme source of truth: `frontend/src/theme/tokens.ts`, `theme.ts`
- Responsive layout constants: `frontend/src/hooks/useResponsive.ts`
- Web/PWA assets: `frontend/public/`, `frontend/scripts/postbuild-pwa.js`
- Android wrapper: `frontend/android/`, configured by `capacitor.config.json`
- Browser smoke tests: `frontend/tests/`, Playwright config at `frontend/playwright.config.ts`

Frontend runtime rule: optimize for a mobile WebView first while retaining responsive desktop web behavior. Use shared `Artwork`, semantic tokens, narrow Zustand selectors, virtualized collections, and reduced-motion-friendly interactions.

## Backend map

- App startup, CORS, static frontend serving: `backend/app/main.py`
- Settings/env parsing: `backend/app/core/config.py`; template: `backend/.env.example`
- Auth/security dependencies: `backend/app/core/security.py`, `backend/app/api/deps.py`
- API registration: `backend/app/api/v1/router.py`
- Endpoint implementations: `backend/app/api/v1/endpoints/`
- ORM models: `backend/app/models/`; request/response schemas: `backend/app/schemas/`
- Async DB setup: `backend/app/db/`
- Background jobs/recovery: `backend/app/workers/job_engine.py`
- Download logic: `backend/app/services/downloader/ytdlp_service.py`
- Recognition: `backend/app/services/recognition/shazam_service.py`
- Telegram: `backend/app/services/telegram/telegram_service.py`
- Storage abstraction: `backend/app/services/storage/`
- Job WebSocket: `backend/app/websockets/job_status.py`
- Integrity tests: `backend/tests/`

Backend architecture note: jobs run in-process with FastAPI/asyncio rather than Celery. Mutate-then-serialize flows with SQLAlchemy relationships should follow the `select(...).options(selectinload(...)).execution_options(populate_existing=True)` pattern already used in recognition/playlist endpoints; `expire_all()` plus `session.get()` can cause `MissingGreenlet` failures.

## Common task routing

- Authentication: frontend `store/authStore.ts` + `services/api/auth.ts`; backend `endpoints/auth.py`, `schemas/auth.py`, `models/user.py`.
- Downloads/jobs: frontend API/store/activity screen; backend `endpoints/downloads.py`, `models/job.py`, `workers/job_engine.py`, downloader service.
- Library/playlists: frontend library screen, library/playlist stores and API modules; backend matching endpoints/models/schemas.
- Playback: `store/playerStore.ts`, `services/audio/`, player components, `PlayerScreen.tsx`, `MiniPlayerBar.tsx`.
- Recognition: `RecognitionScreen.tsx`, `services/api/recognitions.ts`; backend recognition endpoint/service.
- Layout/overlap bugs: `RootNavigator.tsx`, `MainTabs.tsx`, `useResponsive.ts`, `AppSidebar.tsx`, `DesktopSecondaryRail.tsx`, `MiniPlayerBar.tsx`, and the affected screen.
- Styling: begin with `theme/tokens.ts` and existing shared components before adding one-off values.

Known large/high-risk UI areas: `LibraryScreen.tsx`, `HomeScreen.tsx`, `LibrarySheets.tsx`, and `DashboardCustomizer.tsx`. Extract reusable pieces when a task touches them, but avoid unrelated broad rewrites.

## Commands and quality gates

Backend (from `backend/`):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8095 --reload
.\.venv\Scripts\python.exe -m pytest tests
```

Frontend (from `frontend/`):

```powershell
npm run typecheck
npm run build:web
npm run test:smoke
npm run build:android-web
```

Minimum frontend verification is `npm run typecheck`; production-facing changes should also pass `npm run build:web`. Run Playwright smoke tests for navigation, auth, offline, responsive, or interaction changes. Android hardware behavior (microphone, media session, long playback) still requires a physical-device check.

## Configuration and deployment cautions

- Frontend local API: `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:8095`; a physical phone cannot use the development computer's `127.0.0.1`. Android emulator host alias is `10.0.2.2`.
- Never commit `.env`, cookies, tokens, downloaded media, or credentials.
- Render free storage is ephemeral; SQLite data and local media may disappear after restart/redeploy.
- The APK contains the web client and offline-saved media, not the Python backend. Server-dependent features require a reachable backend.
- Root deployment definitions: `render.yaml`, `Dockerfile`; workflows: `.github/workflows/`.

## Deeper references (read only when relevant)

- `README.md`: overview and deployment
- `backend/README.md`: backend behavior/setup
- `frontend/README.md`: frontend runtime/setup
- `docs/PRODUCT_REBUILD.md`: product and design decisions
- `GO_PUBLIC.md`: branding/public-release rationale

## Current working intent

Improve UI and code incrementally: stronger hierarchy and contrast, consistent spacing, responsive mobile/desktop layouts, reusable components, and no content hidden by modals, sidebars, or the mini-player. Keep changes task-scoped and avoid multiple tools or agents editing the same files concurrently.
