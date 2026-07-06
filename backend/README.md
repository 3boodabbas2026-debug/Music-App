# Super Media App — Backend

FastAPI backend: universal link downloader (yt-dlp), Shazam-style recognition (shazamio, ported from
the original `vault_app` project), and a media library API for the React Native client.

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and adjust if needed (a working default is provided for local dev — SQLite,
a dev-only secret key, local `media_storage/` folder).

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8095 --reload
```

`--host 0.0.0.0` (not `127.0.0.1`) so a phone on the same Wi-Fi, or an emulator, can reach it — find your
PC's LAN IP (`ipconfig`) and give that to the frontend's `EXPO_PUBLIC_API_BASE_URL`.

Interactive API docs: `http://127.0.0.1:8095/docs`.

## What's implemented

- **Auth**: JWT access/refresh, register/login/me.
- **Downloads**: `POST /api/v1/downloads` kicks off a background yt-dlp job (audio or video); poll
  `GET /api/v1/downloads/{id}` or subscribe to `WS /api/v1/ws/jobs/{id}` for live progress. Supports
  cancellation mid-download.
- **Recognition**: `POST /api/v1/recognitions` — upload a clip or pass an existing `media_id`; resolves
  synchronously (a few seconds) using shazamio, with an ffmpeg-sample fallback for containers Shazam's
  client can't parse directly.
- **Library**: list/search/patch/delete, plus byte-range streaming (`/library/{id}/stream`) for seeking.
- **Playlists**: basic create/list/add-item.

All of this has been exercised end-to-end against the real network (a real YouTube download, a real
Shazam recognition call, real WebSocket progress push) — see conversation history for the verified flow.

## Architecture notes for whoever picks this up next

- **Job execution** (`app/workers/job_engine.py`) is deliberately simple: FastAPI `BackgroundTasks` +
  `asyncio.to_thread`, no Redis/Celery. This matches running on one machine. If it ever needs to survive
  restarts or scale across workers, swap the two entry points (`run_download_job` / `run_recognition_job`)
  for `arq` tasks — the DB schema and API layer don't need to change, they already only talk to the `Job`
  table, not to "however the work happens to execute."
- **SQLite**, not Postgres — swap `SMA_DATABASE_URL` and add `psycopg`/`asyncpg` when you need it; the
  ORM layer doesn't care.
- **SQLAlchemy async gotcha worth knowing**: passing eager-load `options=` to `session.get()` does *not*
  reliably force a reload of an already-identity-mapped (merely expired) object's relationships — it silently
  no-ops and you get a `MissingGreenlet` error at serialization time instead. Where a request mutates
  something and then needs to re-read it with relationships in the same session, use
  `select(...).options(selectinload(...)).execution_options(populate_existing=True)`, not
  `db.expire_all() + db.get(..., options=...)`. Bit us twice while building this (recognitions, playlists) —
  see `app/api/v1/endpoints/recognitions.py` and `playlists.py` for the working pattern if it recurs
  elsewhere.
