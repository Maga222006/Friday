from aiogram.exceptions import TelegramBadRequest
from friday.database.db import resolve_telegram
from langchain_core.messages.content import (
    create_text_block, create_image_block,
    create_audio_block, create_video_block,
    create_file_block,
)
from aiogram.enums import ChatAction
from aiogram.filters import CommandStart
from aiogram.types import Message
from aiogram import Router, F
from friday.bridge import ask
import asyncio, base64
import logging

router = Router()
LIMIT = 4096

# (file_id, mime, factory) per media kind
def _media(m: Message):
    if m.photo:
        return m.photo[-1].file_id, "image/jpeg", create_image_block
    if m.voice:
        return m.voice.file_id, "audio/ogg", create_audio_block
    if m.video:
        return m.video.file_id, m.video.mime_type or "video/mp4", create_video_block
    if m.audio:
        return m.audio.file_id, m.audio.mime_type or "audio/mpeg", create_audio_block
    return m.document.file_id, m.document.mime_type or "application/octet-stream", create_file_block


async def _content(m: Message) -> str | list[dict]:
    if not (m.photo or m.voice or m.video or m.audio or m.document):
        return m.text

    file_id, mime, factory = _media(m)
    data = (await m.bot.download(file_id)).read()
    blocks = [factory(base64=base64.b64encode(data).decode(), mime_type=mime)]
    if m.caption:
        blocks.insert(0, create_text_block(m.caption))
    return blocks


async def _typing(m: Message, stop: asyncio.Event) -> None:
    while not stop.is_set():
        await m.bot.send_chat_action(m.chat.id, ChatAction.TYPING)
        try:
            await asyncio.wait_for(stop.wait(), timeout=4)
        except asyncio.TimeoutError:
            pass

@router.message(CommandStart())
async def on_start(m: Message) -> None:
    user = await resolve_telegram(str(m.from_user.id))
    if not user:
        await m.answer(f"Not registered. Your ID is {m.from_user.id}.")
        return
    await m.answer(f"Hi {user.username}. Friday here.")


@router.message(F.text | F.photo | F.voice | F.video | F.audio | F.document)
async def on_message(m: Message) -> None:
    user = await resolve_telegram(str(m.from_user.id))
    if not user:
        logging.warning("unknown telegram_id=%s (@%s)", m.from_user.id, m.from_user.username)
        return

    stop = asyncio.Event()
    typing = asyncio.create_task(_typing(m, stop))
    try:
        reply = await asyncio.wait_for(ask(user, "telegram", await _content(m)), 180)
    except asyncio.TimeoutError:
        reply = "That's taking too long — ask me again in a bit."
    except Exception as e:
        reply = f"Couldn't handle that: {e}"
    finally:
        stop.set()
        await typing

    for i in range(0, len(reply), LIMIT):
        try:
            await m.answer(reply[i:i + LIMIT])
        except TelegramBadRequest:
            await m.answer(reply[i:i + LIMIT], parse_mode=None)