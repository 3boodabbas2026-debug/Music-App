from fastapi import APIRouter

from app.api.v1.endpoints import auth, downloads, library, playlists, recognitions, telegram

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(downloads.router)
api_router.include_router(recognitions.router)
api_router.include_router(library.router)
api_router.include_router(playlists.router)
api_router.include_router(telegram.router)
