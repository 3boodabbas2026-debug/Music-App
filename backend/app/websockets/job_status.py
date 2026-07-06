from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.job import Job, JobStatus
from app.schemas.job import JobOut
from app.workers.broadcaster import broadcaster

router = APIRouter()

TERMINAL_STATUSES = {JobStatus.COMPLETE, JobStatus.FAILED, JobStatus.CANCELLED}


@router.websocket("/ws/jobs/{job_id}")
async def job_status_ws(websocket: WebSocket, job_id: str, token: str) -> None:
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        await websocket.close(code=4401)
        return

    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None or job.user_id != payload["sub"]:
            await websocket.close(code=4404)
            return
        await session.refresh(job, attribute_names=["result_media"])
        snapshot = JobOut.model_validate(job).model_dump(mode="json")
        already_terminal = job.status in TERMINAL_STATUSES

    await websocket.accept()
    await websocket.send_json(snapshot)
    if already_terminal:
        await websocket.close()
        return

    queue = broadcaster.subscribe(job_id)
    try:
        while True:
            payload = await queue.get()
            await websocket.send_json(payload)
            if payload.get("status") in {s.value for s in TERMINAL_STATUSES}:
                break
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(job_id, queue)
        try:
            await websocket.close()
        except RuntimeError:
            pass  # already closed (client disconnected or we closed it above)
