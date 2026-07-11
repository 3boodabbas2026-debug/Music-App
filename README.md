# Duskglen

*(repo/folder name: SuperMediaApp — see [GO_PUBLIC.md](GO_PUBLIC.md) for the brand rationale)*

A private music utility for saving media links, identifying nearby songs, organizing a personal library,
and playing it back with queue, lyrics, offline, and lock-screen controls. The Expo web client ships inside
a Capacitor Android shell and uses a restrained dusk-editorial visual system.

Fresh project, independent of the `Telegram/` folder's `vault_app` — see that project's own history for
where the recognition logic and general architecture pattern were ported from.

```
SuperMediaApp/
├── backend/   FastAPI — downloads, recognition, library, auth, streaming, WebSocket job progress
└── frontend/  Expo / React Native Web — capture, identify, library, activity, player
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

### YouTube bot-check cookies

Cloud IPs are often challenged by YouTube ("Sign in to confirm you're not a bot"). If downloads start
failing with that error, export fresh cookies and set them as a Render secret:

1. Open a private/incognito browser window and sign into YouTube in it.
2. In the same window, open `https://www.youtube.com/robots.txt` (keeps the session simple to export).
3. Export only the `youtube.com` cookies as a Netscape `cookies.txt` file (e.g. via a "Get cookies.txt"
   browser extension).
4. Close the private window afterward and don't reopen that session.

Paste the full contents of `cookies.txt` into the backend env var `SMA_YTDLP_COOKIES_TEXT`, or base64-encode
it first and use `SMA_YTDLP_COOKIES_B64` instead (handy for values Render's dashboard mangles):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\cookies.txt")) | Set-Clipboard
```

Redeploy after setting either variable. Cookies are private account credentials — never commit them to
GitHub, and re-export them if YouTube starts challenging downloads again. yt-dlp's Chrome request
impersonation (via `curl-cffi`) is already enabled by default (`SMA_YTDLP_IMPERSONATE=chrome`); if cookies
are fresh but YouTube still rejects the Render IP, set `SMA_YTDLP_PROXY_URL` to a clean residential/ISP
proxy and redeploy.

## Quality gates

- Backend integrity regressions cover deletion, playlist/job references,
  ownership validation, bounded recognition uploads, and rollback behavior.
- Frontend changes must pass `tsc --noEmit`, a production Expo export, and the
  Playwright mobile smoke suite at 390×844.
- The Android workflow requires that quality job before building and replacing
  the rolling `apk-latest` release.

Hardware-specific media-session, microphone, and long-running playback checks
should still be exercised on a physical Android device before a store release.
