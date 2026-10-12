"""Telegram channel: polls Telegram, and serves a push endpoint for the agent."""
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import TelegramBadRequest
from friday.database.db import create_user, list_users, remove_user
from friday.database.models import UserForm, Location
from friday.channels.telegram.handlers import router
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import IntegrityError
from friday.database.db import init_db
from aiogram.enums import ParseMode
from aiogram import Bot, Dispatcher
from dotenv import load_dotenv
from uuid import uuid4
import uvicorn
import asyncio
import logging
import os



load_dotenv()

bot = Bot(
    token=os.environ["TELEGRAM_TOKEN"],
    default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN)
)
app = FastAPI()

PUSH_HOST = os.getenv("PUSH_HOST", "127.0.0.1")
PUSH_PORT = int(os.getenv("PUSH_PORT", "8100"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"], allow_headers=["*"],
)

@app.get("/users")
async def users() -> list[dict]:
    return [u.model_dump(mode="json") for u in await list_users()]

@app.post("/users")
async def add_user(form: UserForm) -> dict:
    location = None
    if form.location and form.location.strip():
        try:
            location = (await asyncio.to_thread(Location.resolve, name=form.location)).model_dump()
        except ValueError as e:
            raise HTTPException(400, str(e))
    try:
        user = await create_user(form.username, (form.telegram_id or "").strip() or None, location)
    except IntegrityError:
        raise HTTPException(409, "User with that Telegram ID is already in registered.")
    return user.model_dump(mode="json")

@app.delete("/users/{user_id}")
async def delete_user(user_id: int) -> dict:
    user = await remove_user(user_id)
    if not user:
        raise HTTPException(404, "No such user.")
    return user.model_dump(mode="json")

@app.post("/push")
async def push(payload: dict) -> dict:
    """Deliver a message to a user who isn't currently waiting."""
    chat_id, text = payload.get("chat_id"), payload.get("text")
    if not chat_id or not text:
        raise HTTPException(400, "need chat_id and text")
    try:
        await bot.send_message(int(chat_id), text)
    except TelegramBadRequest:
        await bot.send_message(int(chat_id), text, parse_mode=None)
    return {"ok": True}

from livekit import api

@app.get("/voice/token")
async def voice_token(user_id: int, thread_id: str | None = None) -> dict:
    token = (
        api.AccessToken(os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"])
        .with_identity(f"user-{user_id}")
        .with_name(str(user_id))
        .with_attributes({"thread_id": thread_id} if thread_id else {})
        .with_grants(api.VideoGrants(room_join=True, room=f"friday-{user_id}-{uuid4().hex[:8]}"))
    )
    return {"url": os.environ["LIVEKIT_URL"], "token": token.to_jwt()}

async def main() -> None:
    await init_db()
    logging.basicConfig(level=logging.INFO)
    dp = Dispatcher()
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)

    server = uvicorn.Server(uvicorn.Config(
        app, host=PUSH_HOST, port=PUSH_PORT, log_level="warning",
    ))
    logging.info("push endpoint on http://%s:%s/push", PUSH_HOST, PUSH_PORT)
    await asyncio.gather(dp.start_polling(bot), server.serve())


if __name__ == "__main__":
    asyncio.run(main())