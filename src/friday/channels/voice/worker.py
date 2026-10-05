from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins.google.beta import GeminiSTT, GeminiTTS
from langchain_core.messages import AIMessageChunk, AIMessage, SystemMessage
from langgraph.pregel.remote import RemoteGraph
from langgraph_sdk import client
from livekit.plugins import langchain, silero
from friday.database.db import get_user
from friday.agent.context import Ctx
from friday.bridge import client, thread_for
from dotenv import load_dotenv
import logging
import os

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("friday.voice")

AEGRA_URL = os.getenv("AEGRA_URL", "http://localhost:2026")
CHANNEL = "voice"

class VoiceRemoteGraph(RemoteGraph):
    async def astream(self, input, *args, **kwargs):
        msgs = input.get("messages", [])
        last_ai = max((i for i, m in enumerate(msgs) if isinstance(m, AIMessage)), default=-1)
        input = {"messages": [m for m in msgs[last_ai + 1:] if not isinstance(m, SystemMessage)]}
        async for item in super().astream(input, *args, **kwargs):
            if isinstance(item, tuple) and len(item) == 2 and isinstance(item[0], dict):
                msg, meta = item
                if not str(msg.get("type", "")).lower().startswith("ai"):
                    continue
                item = (AIMessageChunk(content=msg.get("content", ""), id=msg.get("id")), meta)
            yield item

async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    if ctx.is_fake_job():
        user = await get_user(int(os.getenv("VOICE_USER_ID", "1")))
        thread_id = thread_for(user.id, CHANNEL)
        await client.threads.create(
            thread_id=thread_id,
            if_exists="do_nothing",
            metadata={"user_id": user.id, "channel": CHANNEL},
        )
    else:
        participant = await ctx.wait_for_participant()
        logger.info("participant joined: %s", participant.identity)

        identity = participant.identity or ""
        if not identity.startswith("user-"):
            logger.warning("unknown identity %r — not joining", identity)
            return

        user = await get_user(int(identity.removeprefix("user-")))
        if not user:
            logger.warning("no user row for %r", identity)
            return
        logger.info("serving %s (id=%s)", user.username, user.id)
        thread_id = participant.attributes.get("thread_id") or thread_for(user.id, CHANNEL)
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=GeminiSTT(language_codes=["en-US", "ru-RU"]),
        tts=GeminiTTS(
            voice_name="Kore"
        ),
        llm=langchain.LLMAdapter(
            graph=VoiceRemoteGraph("friday", url=AEGRA_URL),
            config={"configurable": {"thread_id": thread_id}},
            context=Ctx(user=user, channel=CHANNEL).model_dump(mode="json"),
        ),
    )
    await session.start(
        room=ctx.room,
        agent=Agent(instructions="Speak naturally and briefly. No markdown, no lists."),
    )

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))