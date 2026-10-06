# Friday

---
A self-hosted personal assistant you can talk to from a **web app**, **Telegram** and **voice**, all sharing one
memory and one set of conversations.

Friday is the successor of [MultiagentPersonalAssistant](https://github.com/Maga222006/MultiagentPersonalAssistant)
(its ancestor project), rebuilt around [deepagents](https://github.com/langchain-ai/deepagents) and a
self-hosted LangGraph server ([Aegra](https://github.com/aegra/aegra)).
---
## Features

- **One agent, three channels.** Web UI, Telegram bot and voice all talk to the same `friday` graph; conversations
  from every channel show up in the web sidebar (Telegram ones marked **TG**).
- **Long-term memory.** Facts about you are kept in a semantic store (`remember` / `recall` / `forget`).
- **Research subagents.** A quick `researcher` for lookups and a background `researcher_async` for longer research
  (Tavily search + page extraction).
- **Schedules.** Recurring or one-off tasks bound to a conversation. Create them from the web UI's Schedules panel
  or let the agent schedule itself ("remind me at 18:00", "brief me every weekday morning").
- **Tools.** Time and weather for your location, Home Assistant smart-home control, MCP servers from `config.yaml`.
- **Multimodal.** Send images, PDFs, audio and voice notes (Telegram and web).
- **Voice.** In the browser via LiveKit, or always-on from a room microphone (`console` mode).
- **Web UI.** Live-updating threads, Markdown with math and code highlighting, tool calls inline, edit / regenerate,
  dark mode, mobile layout, and a YAML editor for `config.yaml`.
- **Swappable models.** Any LangChain model (Gemini, OpenAI, local Ollama / llama.cpp via `base_url`) with fallbacks.
---
## Architecture

```
 Browser (Next.js, :3000) ─┐                       ┌─ LiveKit Cloud ── voice worker (web calls)
                           ├─► Aegra (:2026) ◄─────┤
 Telegram ── bot (:8100) ──┘   friday graph         └─ voice worker (console: room mic)
               ▲               researcher graph
               │ /push         crons, threads, memory
               └────────────── Postgres (pgvector) + Redis
```

| Part | Path | Port |
|---|---|---|
| Agent server (Aegra: graphs, threads, store, crons) | `aegra.json`, `src/friday/agent/` | 2026 |
| Telegram bot + API (`/users`, `/push`, `/voice/token`) | `src/friday/channels/telegram/` | 8100 |
| Voice worker (LiveKit agent) | `src/friday/channels/voice/worker.py` | — |
| Web UI (Next.js + assistant-ui) | `friday-web/` | 3000 |
| Users database | `src/friday/database/` | Postgres `friday_app` |
---
## Requirements

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js 22 and npm
- Docker (Postgres and Redis, or the whole stack)
- API keys: Google AI (Gemini), Tavily, a Telegram bot token, a LiveKit project; optionally OpenWeatherMap and
  Home Assistant
---
## Configuration

### `.env` (project root)

```bash
GOOGLE_API_KEY=...
TAVILY_API_KEY=...
OPENWEATHERMAP_API_KEY=...          # optional, for the weather tool
TELEGRAM_TOKEN=...
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
HOMEASSISTANT_URL=https://<host>/api   # optional, smart-home tools
HOMEASSISTANT_TOKEN=...

# Aegra / Postgres (must match docker-compose.yml)
POSTGRES_USER=friday
POSTGRES_PASSWORD=friday_secret
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=friday

# users database (separate from Aegra's)
APP_DATABASE_URL=postgresql+asyncpg://friday:friday_secret@localhost:5432/friday_app

# allow schedules every 30 s (status checks of background research)
CRON_ALLOW_SECONDS_SCHEDULE=true
CRON_POLL_INTERVAL_SECONDS=10

# optional
VOICE_USER_ID=1                      # who talks to the room mic in console mode

# HTTPS for other devices on your network (see "Use it from your phone / other devices")
FRIDAY_HOSTS=my-mac.local, 192.168.1.20, localhost
FRIDAY_DEFAULT_SNI=192.168.1.20
```

### `friday-web/.env.local` (optional)

The UI reaches Aegra and the bot API through its own server (`/aegra`, `/friday`, see `friday-web/next.config.ts`),
so it needs no URLs. Only override what differs from the defaults:

```bash
AEGRA_INTERNAL_URL=http://localhost:2026
FRIDAY_INTERNAL_URL=http://localhost:8100
NEXT_PUBLIC_ASSISTANT_ID=friday
```

### `config.yaml`

Models and MCP servers. Edit it here or in the web UI (⚙ Config), then restart Aegra.

```yaml
models:
  primary: google_genai:gemini-flash-latest      # "provider:model" …
  fallbacks:
    - google_genai:gemini-flash-lite-latest
  researcher: google_genai:gemini-pro-latest
  # … or an object with init_chat_model arguments, e.g. a local Ollama model:
  # primary:
  #   model: gemma4:e4b-mlx
  #   model_provider: openai
  #   base_url: http://localhost:11434/v1
  #   api_key: ollama
mcp:
  langchain_docs:
    transport: http
    url: https://docs.langchain.com/mcp
```

`${VAR}` in `config.yaml` is filled from `.env`, so tokens can stay out of the file.

---
## Run with Docker (everything in one command)

```bash
docker compose up --build -d
```

Opens the web UI on http://localhost:3000 and starts Postgres, Redis, Aegra, the Telegram bot and the web-voice
worker. Useful commands:

```bash
docker compose logs -f friday        # agent server logs (also: bot, voice, web)
docker compose restart friday bot voice   # pick up Python / config.yaml changes (src/ is mounted)
docker compose down                  # stop everything (data is kept)
```

### Use it from your phone / other devices

Browsers only allow the microphone (voice mode) and clipboard on HTTPS, so on your network the UI is served over
HTTPS by Caddy (`https` service, `docker/Caddyfile`) with its own local certificate authority:

1. In `.env`, list how you reach the machine: `FRIDAY_HOSTS` (its `.local` name from
   `scutil --get LocalHostName`, its IP from `ipconfig getifaddr en0`, and `localhost`) and `FRIDAY_DEFAULT_SNI`
   (the IP). Then `docker compose up -d`. Reserve the IP in your router so it doesn't change.
2. On each device, once: open `http://<machine>/friday-ca.crt` and trust the certificate.
   - **iPhone / iPad:** allow the download, then Settings → Profile Downloaded → Install, then Settings → General →
     About → Certificate Trust Settings → turn on "Caddy Local Authority".
   - **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA certificate.
   - **Mac:** open the file, add it to the System keychain, double-click it → Trust → "Always Trust".
   - **Windows:** open the file → Install Certificate → Local Machine → "Trusted Root Certification Authorities".
3. Open `https://<machine>`: everything works as on localhost, including voice.

Stop any locally running Aegra, bot, worker or `npm run dev` first: they use the same ports, and two bots polling
Telegram at once conflict.
---
## Run locally (development)

Install dependencies once:

```bash
uv sync
cd friday-web && npm install && cd ..
```

Then, each in its own terminal:

```bash
uv run aegra dev                                      # agent server on :2026 (starts Postgres in Docker)
uv run python -m friday.channels.telegram.bot         # Telegram bot + API on :8100
uv run python -m friday.channels.voice.worker dev     # voice worker for the web UI
cd friday-web && npm run dev                          # web UI on :3000
```

### Always-on room microphone (optional)

Runs the voice agent on the machine's own microphone and speakers, no browser needed, with echo cancellation.
It has to run natively (Docker on macOS has no audio access):

```bash
uv run python -m friday.channels.voice.worker console
```

To keep it running in the background and restart it if the mic disappears:

```bash
screen -dmS friday zsh -c 'cd /path/to/friday && while true; do uv run python -m friday.channels.voice.worker console; sleep 2; done'
screen -r friday      # watch it; Ctrl+A then D to detach
```

Add `--input-device "<name>"` to pick a specific microphone (`--list-devices` lists them). macOS asks for
microphone permission on the first run.
---
## First steps

1. Open http://localhost:3000 and create your profile with **+** in the sidebar (name, city, optional Telegram ID).
2. To use Telegram, send `/start` to your bot: it replies with your Telegram ID if you're not registered yet.
3. Talk to Friday in the web UI, on Telegram or with the **Voice** button. Everything lands in the same sidebar.
---
## Security notes

- There is **no authentication**: anyone who can reach ports 2026, 8100 or 3000 can act as any user. Keep it on
  your machine or a trusted network.
- The ⚙ Config editor only works from `localhost`.
- The agent's `/workspace/` backend can run shell commands on the host. Remove it from
  `src/friday/agent/graph.py` if you don't need it.
