from deepagents import AsyncSubAgent, create_deep_agent, CompiledSubAgent
from langchain.agents.middleware import ModelFallbackMiddleware
from friday.agent.prompts import RESEARCH_SYSTEM_PROMPT
from langgraph_sdk.client import ThreadsClient
from friday.agent.tools import research_tools
from friday.config import cfg
import os



_get_thread = ThreadsClient.get

async def _get_thread_with_values(self, thread_id, **kwargs):
    thread = await _get_thread(self, thread_id, **kwargs)
    if not thread.get("values"):
        thread["values"] = (await self.get_state(thread_id)).get("values") or {}
    return thread

ThreadsClient.get = _get_thread_with_values

research_graph = create_deep_agent(
    model=cfg.models.researcher,
    system_prompt=RESEARCH_SYSTEM_PROMPT,
    middleware=[
        *([ModelFallbackMiddleware(*cfg.models.fallbacks)] if cfg.models.fallbacks else []),
    ],
    tools=research_tools,
    name="researcher",
)

research_agent = CompiledSubAgent(
    name="researcher",
    description="Quick web lookup: facts, news, prices, anything you are unsure about. "
                "Returns a short answer with sources. You wait for it.",
    runnable=research_graph,
)
research_agent_async = AsyncSubAgent(
    name="researcher_async",
    description="Long web research in the background: many sources, comparisons, reports. "
                "Returns a task id immediately; schedule checks every 30 seconds to get the result, "
                "don't forget to cancel the scheduled checks afterwards..",
    graph_id="researcher",
    url=os.getenv("AEGRA_URL", "http://localhost:2026"),
)