"""Main Friday graph. Must expose a module-level `graph` object."""
from deepagents.backends import CompositeBackend, StateBackend, LocalShellBackend
from friday.agent.subagents.research import research_agent, research_agent_async
from langchain.agents.middleware import ModelFallbackMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from friday.agent.middleware import system_prompt
from deepagents import create_deep_agent
from friday.agent.context import Ctx
from friday.agent.tools import tools
from dotenv import load_dotenv
from friday.config import cfg
import logging

load_dotenv()
logger = logging.getLogger(__name__)

async def mcp_tools():
    if cfg.mcp:
        try:
            mcp_client = MultiServerMCPClient(cfg.mcp)
            mcp_tools_list = await mcp_client.get_tools()
            return mcp_tools_list
        except Exception:
            logger.exception("Failed to connect to MCP.")
            return []
    return []

async def build_graph():
    backend = CompositeBackend(
        default=StateBackend(),
        routes={
            "/workspace/": LocalShellBackend(
                root_dir="./workspace",
                virtual_mode=True
            )
        }
    )
    return create_deep_agent(
        model=cfg.models.primary,
        tools=tools + await mcp_tools(),
        context_schema=Ctx,
        subagents=[research_agent, research_agent_async],
        middleware=[
            *([ModelFallbackMiddleware(*cfg.models.fallbacks)] if cfg.models.fallbacks else []),
            system_prompt
        ],
        backend=backend,
    )

