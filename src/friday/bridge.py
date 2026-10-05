from friday.database.models import User
from uuid import uuid5, NAMESPACE_URL
from langgraph_sdk import get_client
from friday.agent.context import Ctx
from typing import Any
import os

ContentBlock = dict[str, Any]
client = get_client(url=os.getenv("AEGRA_URL", "http://localhost:2026"))

def thread_for(user_id: int, channel: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"friday/{channel}/{user_id}"))

def _as_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type", "text") == "text"
        )
    return str(content)


async def ask(user: User, channel: str, content: str | list[ContentBlock]) -> str:
    """Identify → Ctx → thread → run. Every channel calls this."""
    thread_id = thread_for(user.id, channel)
    await client.threads.create(
        thread_id=thread_id,
        if_exists="do_nothing",
        metadata={"user_id": user.id, "channel": channel},
    )
    result = await client.runs.wait(
        thread_id,
        assistant_id="friday",
        input={"messages": [{"role": "human", "content": content}]},
        context=Ctx(user=user, channel=channel).model_dump(mode="json"),
    )
    return  _as_text(result["messages"][-1]["content"]) or "(no reply)"