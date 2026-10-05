from langchain_community.tools.yahoo_finance_news import YahooFinanceNewsTool
from langchain_community.utilities import OpenWeatherMapAPIWrapper
from friday.agent.integrations.smart_home import smart_home_tools
from langchain_tavily.tavily_search import TavilySearch
from friday.database.models import Location
from langchain_tavily import TavilyExtract
from langgraph.prebuilt import ToolRuntime
from timezonefinder import TimezoneFinder
from langgraph_sdk import get_client
from friday.agent.context import Ctx
from dotenv import load_dotenv
from geopy import Nominatim
from zoneinfo import ZoneInfo
import datetime
import httpx
import uuid
import os

load_dotenv()

tf = TimezoneFinder()
tavily_search = TavilySearch(
    max_results=10,
    topic="general",
    include_answer=True,
)
tavily_extract = TavilyExtract()
yahoo = YahooFinanceNewsTool()
geolocator = Nominatim(user_agent="my_geocoder")
weekday_mapping = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
aegra = get_client(url=os.getenv("AEGRA_URL", "http://localhost:2026"))

def current_time(
    location_name: str | None = None,
    runtime: ToolRuntime[Ctx] = None,
):
    """Get the current time for a location or, when omitted, for the current chat user."""
    try:
        location = Location.resolve(name=location_name) if location_name else runtime.context.user.location
        current_dt = datetime.datetime.now(ZoneInfo(location.timezone or "UTC"))
        weekday = weekday_mapping[current_dt.weekday()]
        return (
            f"Location: {location.name}; Current Date and Time: "
            f"{current_dt.strftime('%Y-%m-%d %H:%M')}, {weekday}."
        )
    except Exception as e:
        return f"Error getting current time: {str(e)}"

def weather(
    location_name: str | None = None,
    runtime: ToolRuntime[Ctx] = None,
):
    """Get the current weather for a location, when omitted, for the current chat user location."""
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key:
        return "Error: OPENWEATHERMAP_API_KEY is not set in .env. Add it to use weather."
    try:
        location = Location.resolve(name=location_name) if location_name else runtime.context.user.location
        weather_wrapper = OpenWeatherMapAPIWrapper(openweathermap_api_key=api_key)
        return weather_wrapper.run(location=location.name)
    except Exception as e:
        return f"Error getting weather: {str(e)}"

def remember(fact: str, runtime: ToolRuntime[Ctx]):
    """Remember the fact."""
    ns = (str(runtime.context.user.id), "memories")
    runtime.store.put(ns, str(uuid.uuid4()), {"fact": fact})
    return f"Remebered: {fact}"

def recall(query: str, runtime: ToolRuntime[Ctx], limit: int = 5):
    """Retrieve the remembered facts from memory."""
    ns = (str(runtime.context.user.id), "memories")
    memories = runtime.store.search(ns, query=query, limit=limit)
    if not memories:
        return "Nothing relevant remembered."
    return "\n".join(f"- {memory.value['fact']}" for memory in memories)

def forget(query: str, runtime: ToolRuntime[Ctx]):
    """Remove the remembered facts from memory."""
    ns = (str(runtime.context.user.id), "memories")
    memories = runtime.store.search(ns, query=query, limit=1)
    if not memories:
        return "No matching memory found."
    runtime.store.delete(ns, memories[0].key)
    return f"Forgot {memories[0].value['fact']}"

async def push_on_telegram(text: str, runtime: ToolRuntime[Ctx]) -> str:
    """Send a message to the user right now on telegram, outside the current conversation.
    Use for finished background work or time-sensitive news for telegram channel or if you need to access user immediately."""
    chat_id = runtime.context.user.telegram_id
    if not chat_id:
        return "No Telegram for this user."
    async with httpx.AsyncClient() as c:
        r = await c.post("http://localhost:8100/push",
                     json={"chat_id": int(chat_id), "text": text})
        if r.status_code != 200:
            return f"Telegram push failed ({r.status_code})."

    return "Sent."


async def schedule(prompt: str, cron: str, runtime: ToolRuntime[Ctx] = None) -> str:
    """Do `prompt` later in this conversation, in the user's timezone.
        cron = "minute hour day month weekday", optionally with seconds first. Examples:
          "0 8 * * *"        every day at 08:00
          "30 18 * * 1-5"    weekdays at 18:30
          "15 9 5 10 *"      once, 5 October at 09:15 (cancel it after it runs)
          "*/30 * * * * *"   every 30 seconds (only for checking a background task)"""
    location = runtime.context.user.location
    try:
        cron_job = await aegra.crons.create_for_thread(
            runtime.config["configurable"]["thread_id"], "friday",
            schedule=cron,
            timezone=location.timezone if location and location.timezone else "UTC",
            input={"messages": [{"role": "human", "content": prompt}]},
            context=runtime.context.model_dump(mode="json"),
            enabled=False,
        )
    except Exception as e:
        return f"Couldn't schedule: {e}"
    await aegra.crons.update(
        cron_job["cron_id"],
        enabled=True,
        input={"messages": [{"role": "human", "content": f"[Scheduled {cron_job["cron_id"]}] {prompt}"}]}
    )
    return f"Scheduled, id {cron_job['cron_id']}."

async def list_schedules(runtime: ToolRuntime[Ctx]) -> str:
    """List this conversation's schedules."""
    crons = await aegra.crons.search(thread_id=runtime.config["configurable"]["thread_id"])
    return "\n".join(f"{c['cron_id']}: {c['schedule']} ({c['payload'].get('timezone', 'UTC')}): "
                     f"{c['payload']['input']['messages'][0]['content']}" for c in crons) or "No schedules."

async def cancel_schedule(schedule_id: str, runtime: ToolRuntime[Ctx]) -> str:
    """Cancel a schedule by its id (see list_schedules)."""
    await aegra.crons.delete(schedule_id)
    return "Cancelled."

research_tools = [tavily_search, tavily_extract, yahoo]

tools = [
    schedule, list_schedules, cancel_schedule,
    remember, recall, forget,
    current_time, weather,
    *smart_home_tools,
    push_on_telegram
]
