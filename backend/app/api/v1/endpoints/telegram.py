from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from telethon.errors import SessionPasswordNeededError

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.job import Job, JobType
from app.models.telegram_account import TelegramAccount
from app.models.user import User
from app.schemas.job import JobOut
from app.schemas.telegram import (
    TelegramCodeIn,
    TelegramDialogOut,
    TelegramImportIn,
    TelegramPasswordIn,
    TelegramSettingsIn,
    TelegramStatusOut,
)
from app.services.telegram import telegram_service
from app.workers import job_engine
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/telegram", tags=["telegram"])


async def _get_account(user_id: str, db: AsyncSession) -> TelegramAccount | None:
    return await db.get(TelegramAccount, user_id)


@router.get("/status", response_model=TelegramStatusOut)
async def telegram_status(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TelegramStatusOut:
    account = await _get_account(current_user.id, db)
    if account is None:
        return TelegramStatusOut(configured=False, authorized=False)
    try:
        authorized = await telegram_service.is_authorized(account)
    except Exception:  # noqa: BLE001 - bad credentials shouldn't 500 the status check
        authorized = False
    return TelegramStatusOut(configured=True, authorized=authorized, phone=account.phone)


@router.post("/settings", response_model=TelegramStatusOut)
async def save_settings(
    payload: TelegramSettingsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramStatusOut:
    account = await _get_account(current_user.id, db)
    if account is None:
        account = TelegramAccount(
            user_id=current_user.id, api_id=payload.api_id, api_hash=payload.api_hash, phone=payload.phone
        )
        db.add(account)
    else:
        account.api_id = payload.api_id
        account.api_hash = payload.api_hash
        account.phone = payload.phone
    await db.commit()
    return TelegramStatusOut(configured=True, authorized=False, phone=account.phone)


@router.post("/send-code")
async def send_code(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    account = await _get_account(current_user.id, db)
    if account is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Save your Telegram API settings first")

    await telegram_service.drop_pending(current_user.id)

    client = telegram_service.make_client(account)
    await client.connect()
    if await client.is_user_authorized():
        await client.disconnect()
        return {"status": "authorized"}

    try:
        await client.send_code_request(account.phone)
    except Exception as exc:  # noqa: BLE001 - surface Telegram's reason to the user
        await client.disconnect()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Telegram rejected the request: {exc}")

    telegram_service.pending_logins[current_user.id] = {"client": client, "phone": account.phone}
    return {"status": "code_sent", "phone": account.phone}


@router.post("/verify-code")
async def verify_code(
    payload: TelegramCodeIn, current_user: User = Depends(get_current_user)
) -> dict:
    pending = telegram_service.pending_logins.get(current_user.id)
    if not pending:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request a login code first")
    client = pending["client"]
    try:
        await client.sign_in(phone=pending["phone"], code=payload.code.strip())
    except SessionPasswordNeededError:
        return {"status": "password_required"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Sign-in failed: {exc}")

    if await client.is_user_authorized():
        await telegram_service.drop_pending(current_user.id)
        return {"status": "authorized"}
    return {"status": "code_sent"}


@router.post("/verify-password")
async def verify_password(
    payload: TelegramPasswordIn, current_user: User = Depends(get_current_user)
) -> dict:
    pending = telegram_service.pending_logins.get(current_user.id)
    if not pending:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No pending Telegram login")
    client = pending["client"]
    try:
        await client.sign_in(password=payload.password)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"2FA sign-in failed: {exc}")
    await telegram_service.drop_pending(current_user.id)
    return {"status": "authorized"}


@router.get("/dialogs", response_model=list[TelegramDialogOut])
async def list_dialogs(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[TelegramDialogOut]:
    account = await _get_account(current_user.id, db)
    if account is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Save your Telegram API settings first")

    client = telegram_service.make_client(account)
    dialogs: list[TelegramDialogOut] = []
    try:
        await client.connect()
        if not await client.is_user_authorized():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Telegram is not linked yet")
        async for dialog in client.iter_dialogs(limit=100):
            dialogs.append(
                TelegramDialogOut(
                    id=str(dialog.entity.id),
                    title=dialog.name or "Untitled chat",
                    username=getattr(dialog.entity, "username", None),
                )
            )
    finally:
        await client.disconnect()
    return dialogs


@router.post("/import", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def start_import(
    payload: TelegramImportIn,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobOut:
    if payload.media_kind not in {"music", "video"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "media_kind must be 'music' or 'video'")

    account = await _get_account(current_user.id, db)
    if account is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Save your Telegram API settings first")

    job = Job(
        user_id=current_user.id,
        job_type=JobType.DOWNLOAD,
        source_url=f"telegram:{payload.chat}",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(
        job_engine.run_telegram_import_job,
        job.id,
        current_user.id,
        payload.chat,
        payload.media_kind,
        payload.limit,
    )
    return JobOut.model_validate(job)
