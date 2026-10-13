from langchain.agents.middleware import ModelRequest, before_agent, dynamic_prompt, wrap_tool_call
from friday.agent.prompts import SYSTEM_PROMPT
from zoneinfo import ZoneInfo
import datetime

from langchain_core.messages import ToolMessage
from langgraph.errors import GraphBubbleUp


@wrap_tool_call
async def tool_errors_as_messages(request, handler):
    try:
        return await handler(request)
    except GraphBubbleUp:
        raise
    except Exception as e:
        return ToolMessage(f"{request.tool_call['name']} failed: {e}",
                           tool_call_id=request.tool_call['id'], status="error")

@dynamic_prompt
def system_prompt(request: ModelRequest) -> str:
    user = request.runtime.context.user
    location = user.location
    tz = location.timezone if location and location.timezone else "UTC"
    prompt = (
        f"{SYSTEM_PROMPT}"
        f"You are speaking with {user.username}.\n"
        f"Location: {location.name if location else 'unknown'} "
        f"(timezone {location.timezone if location and location.timezone else 'UTC'})."
        f"Today is {datetime.datetime.now(ZoneInfo(tz)):%A, %d %B %Y}."
    )
    if request.runtime.context.channel == "telegram":
        prompt += "\nOn scheduled runs nobody is waiting: send the result with push_on_telegram tool."
    elif request.runtime.context.channel == "voice":
        prompt += "\nYou are speaking out loud: short sentences, no markdown, no lists."
    return prompt