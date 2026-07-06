# Super Media App

A universal link downloader (TikTok/YouTube/etc. via yt-dlp), Shazam-style recognition (shazamio), and
a Spotify-style library/player, wrapped in a React Native client built around a single audio-reactive 3D
"Orb" that serves as the app's visual identity across every screen.

Fresh project, independent of the `Telegram/` folder's `vault_app` — see that project's own history for
where the recognition logic and general architecture pattern were ported from.

```
SuperMediaApp/
├── backend/   FastAPI — downloads, recognition, library, auth, streaming, WebSocket job progress
└── frontend/  React Native (Expo) — 3D Orb, paste-link, recognize, library, player
```

Start here:

1. [`backend/README.md`](backend/README.md) — set up and run the API server first.
2. [`frontend/README.md`](frontend/README.md) — point the app at your backend's LAN IP and run it in
   Expo Go.

## Free Production Deploy On Render

This repo includes a `render.yaml` Blueprint for a free Render deployment:

- `supermediaapp-api`: FastAPI backend on Render's free web-service plan.
- `supermediaapp-web`: Expo web static build on Render's free static hosting.

Important free-tier caveat: Render free web services have an ephemeral filesystem. The app will run, but
SQLite data and downloaded media can disappear on restarts or redeploys unless you upgrade to a paid web
service with a persistent disk or move the database/storage to managed services.

Deploy flow:

1. Put the whole `SuperMediaApp/` folder in a GitHub repository with `render.yaml` at the repo root.
2. In Render, choose **New > Blueprint** and connect that repository.
3. Deploy the Blueprint.
4. After the backend gets its URL, set the frontend env var:
   `EXPO_PUBLIC_API_BASE_URL=https://supermediaapp-api.onrender.com`
5. Optional but recommended for public links: set backend `SMA_REGISTRATION_INVITE_CODE` and set frontend
   `EXPO_PUBLIC_REGISTRATION_INVITE_REQUIRED=true`.

If you deploy the frontend and backend manually instead of via Blueprint:

- Backend build command: `pip install -r requirements.txt`
- Backend start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Backend health check: `/health`
- Frontend build command: `npm ci && npm run build:web`
- Frontend publish directory: `dist`

## What's been verified vs. what needs your eyes

**Backend — verified end-to-end against the real network**, in this session: registered a user, downloaded
a real YouTube video through yt-dlp, streamed it back with working byte-range requests, ran it through the
real Shazam recognition API (got a real, if low-confidence, match), watched live progress over the actual
WebSocket connection, and exercised playlists/library CRUD and auth edge cases (401, 409). Bugs found
during that testing (a few SQLAlchemy async footguns, a pydantic/ORM relationship-naming collision, a
non-monotonic progress bar) were fixed and re-verified, not just patched and assumed fixed.

**Frontend — compiles and bundles cleanly, not yet run on a device.** This sandbox has no
Android/iOS/emulator tooling, so `npx tsc --noEmit` and a full `expo export` bundle are the strongest
checks available here. The three core flows (paste-link → progress → library; mic → recognize → find &
download; library → player → seek) are wired against the real, verified backend API, but I have not
watched them run. Treat the frontend as "should work, please confirm on your phone" rather than "done."
