from langchain.agents.middleware import ModelRequest, before_agent, dynamic_prompt

from friday.agent.prompts import SYSTEM_PROMPT


@dynamic_prompt
def system_prompt(request: ModelRequest) -> str:
    user = request.runtime.context.user
    location = user.location
    prompt = (
        f"{SYSTEM_PROMPT}"
        "You are Friday, a personal assistant. Be concise and clear.\n"
        f"You are speaking with {user.username}.\n"
        f"Location: {location.name if location else 'unknown'} "
        f"(timezone {location.timezone if location and location.timezone else 'UTC'})."
    )
    if request.runtime.context.channel == "telegram":
        prompt += "\nOn scheduled runs nobody is waiting: send the result with push_on_telegram tool."
    elif request.runtime.context.channel == "voice":
        prompt += "\nYou are speaking out loud: short sentences, no markdown, no lists."
    return prompt