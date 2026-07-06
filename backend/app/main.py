from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import init_models
from app.websockets.job_status import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_models()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")

static_dir = Path(os.getenv("SMA_STATIC_DIR", Path(__file__).resolve().parents[2] / "static"))
index_file = static_dir / "index.html"
if static_dir.exists():
    expo_static_dir = static_dir / "_expo"
    assets_static_dir = static_dir / "assets"
    if expo_static_dir.exists():
        app.mount("/_expo", StaticFiles(directory=expo_static_dir), name="expo")
    if assets_static_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_static_dir), name="assets")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)

    requested_file = static_dir / full_path
    if requested_file.is_file():
        return FileResponse(requested_file)
    if index_file.is_file():
        return FileResponse(index_file)
    raise HTTPException(status_code=404)
