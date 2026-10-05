import { Client, type Cron, type Thread } from "@langchain/langgraph-sdk";
import type { LangChainMessage } from "@assistant-ui/react-langgraph";

export type Location = { name: string | null; timezone: string | null };
export type User = {
  id: number;
  username: string;
  telegram_id: string | null;
  location: Location | null;
};
export type Channel = "web" | "telegram" | "voice";

export const CHANNEL = "web";
const ASSISTANT = process.env.NEXT_PUBLIC_ASSISTANT_ID ?? "friday";

// Aegra and the bot API are reached through this app (next.config.ts forwards
// /aegra and /friday), so the UI works from any device that can open the page.
// The SDK needs an absolute URL; during server rendering nothing is fetched.
const ORIGIN = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
const FRIDAY_API = `${ORIGIN}/friday`;

/** How often the UI re-checks Aegra for writes made elsewhere (Telegram,
 *  schedules, pushes). Aegra has no thread-level stream, so we poll. */
export const POLL_MS = 3000;

export const client = new Client({ apiUrl: `${ORIGIN}/aegra` });

/** The Ctx the agent expects — same shape bridge.py sends. */
export const contextFor = (user: User, channel: string = CHANNEL) => ({ user, channel });

/* ---------------------------------------------------------------- threads */

export const createThread = (user: User) =>
  client.threads.create({ graphId: ASSISTANT, metadata: { user_id: user.id, channel: CHANNEL } });

export const getThread = (threadId: string) => client.threads.get(threadId);

/** Every thread of the user, whatever channel it came from. */
export const listThreads = (user: User): Promise<Thread[]> =>
  client.threads.search({
    metadata: { user_id: user.id },
    limit: 100,
    sortBy: "updated_at",
    sortOrder: "desc",
  });

export const getThreadState = (threadId: string) =>
  client.threads.getState<{ messages: LangChainMessage[] }>(threadId);

type Block = Record<string, unknown>;

/** The Telegram bot stores media as LangChain v1 blocks (`{type, base64,
 *  mime_type}`), which assistant-ui can't render. Rewrite them into the
 *  legacy shapes it understands. Display only — nothing is written back. */
const legacyBlock = (b: Block): Block => {
  if (typeof b.base64 !== "string") return b;
  const mime = String(b.mime_type ?? "application/octet-stream");
  // photos sent as Telegram documents arrive as `file` blocks: show them as images too
  if (b.type === "image" || mime.startsWith("image/")) {
    return { type: "image_url", image_url: { url: `data:${mime};base64,${b.base64}` } };
  }
  if (b.type === "file" || b.type === "audio" || b.type === "video") {
    const filename = (b.extras as Block | undefined)?.filename ?? (b.metadata as Block | undefined)?.filename;
    return {
      type: "file",
      source_type: "base64",
      data: b.base64,
      mime_type: mime,
      metadata: { filename: typeof filename === "string" ? filename : `${b.type}.${mime.split("/")[1] ?? "bin"}` },
    };
  }
  return b;
};

export const forDisplay = (messages: LangChainMessage[]): LangChainMessage[] =>
  messages.map((m) =>
    Array.isArray(m.content)
      ? ({ ...m, content: (m.content as unknown as Block[]).map(legacyBlock) } as unknown as LangChainMessage)
      : m,
  );

export const setThreadTitle = (threadId: string, title: string) =>
  client.threads.update(threadId, { metadata: { title } });

export const deleteThread = (threadId: string) => client.threads.delete(threadId);

const meta = (t: Thread) => (t.metadata ?? {}) as Record<string, unknown>;

export const threadChannel = (t: Thread): Channel => {
  const c = meta(t).channel;
  return c === "telegram" || c === "voice" ? c : "web";
};

/** Best-effort label for a thread in the sidebar. */
export const threadTitle = (t: Thread): string => {
  if (threadChannel(t) === "telegram") return "Telegram";
  for (const key of ["title", "thread_name"]) {
    const v = meta(t)[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "New chat";
};

/* ------------------------------------------------------------------- runs */

/** `checkpointId` forks the run from an earlier point (edit / regenerate). */
export const streamRun = (
  threadId: string,
  messages: LangChainMessage[],
  user: User,
  signal: AbortSignal,
  checkpointId?: string,
) =>
  client.runs.stream(threadId, ASSISTANT, {
    input: { messages },
    context: contextFor(user),
    streamMode: ["messages", "updates"],
    signal,
    ...(checkpointId && { checkpointId }),
  });

/**
 * The checkpoint whose messages are exactly `parent` — where an edited message
 * or a regenerated reply branches off. Several checkpoints can hold the same
 * messages (one per graph step); prefer the one where the turn had finished,
 * else the earliest. History is newest-first.
 */
export const checkpointFor = async (threadId: string, parent: LangChainMessage[]): Promise<string | null> => {
  const ids = parent.map((m) => m.id);
  const history = await client.threads.getHistory<{ messages?: LangChainMessage[] }>(threadId, { limit: 500 });
  const same = history.filter((s) => {
    const msgs = s.values?.messages ?? [];
    return msgs.length === ids.length && msgs.every((m, i) => m.id === ids[i]);
  });
  const finished = same.find((s) => s.next.length === 0);
  return (finished ?? same.at(-1))?.checkpoint.checkpoint_id ?? null;
};

/* -------------------------------------------------------------- schedules */

export const listCrons = (threadId: string): Promise<Cron[]> =>
  client.crons.search({ threadId, limit: 100 });

export const countCrons = (threadId: string): Promise<number> =>
  client.crons.count({ threadId });

/** Bound to the thread: each run appends to it. A Telegram thread keeps the
 *  telegram channel so the agent can still `notify`; anything else is web.
 *  Aegra fires a new cron once right away unless it's created disabled, so
 *  create it disabled and switch it on: the first run is then the scheduled one. */
export const createCron = async (
  thread: Thread,
  user: User,
  { schedule, prompt, timezone }: { schedule: string; prompt: string; timezone: string },
) => {
  const cron = (await client.crons.createForThread(thread.thread_id, ASSISTANT, {
    schedule,
    timezone,
    enabled: false,
    input: { messages: [{ role: "human", content: prompt }] },
    context: contextFor(user, threadChannel(thread) === "telegram" ? "telegram" : CHANNEL),
  })) as unknown as Cron;
  return client.crons.update(cron.cron_id, { enabled: true });
};

export const deleteCron = (cronId: string) => client.crons.delete(cronId);

/* ------------------------------------------------------------ friday api */

export const fetchUsers = async (): Promise<User[]> => {
  const r = await fetch(`${FRIDAY_API}/users`);
  if (!r.ok) throw new Error(`GET /users -> ${r.status}`);
  return r.json();
};

export const createUser = async (form: {
  username: string;
  telegram_id?: string;
  location?: string;
}): Promise<User> => {
  const r = await fetch(`${FRIDAY_API}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!r.ok) {
    const detail = await r.json().then((j) => j.detail, () => null);
    throw new Error(typeof detail === "string" ? detail : `POST /users -> ${r.status}`);
  }
  return r.json();
};

export const deleteUser = async (userId: number): Promise<void> => {
  const r = await fetch(`${FRIDAY_API}/users/${userId}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE /users/${userId} -> ${r.status}`);
};

/** Threads of the user (their schedules cascade). Memories live in the
 *  agent's store, which Aegra's HTTP store API can't reach (it scopes every
 *  namespace under the caller) — DELETE /users purges those server-side. */
export const purgeUserThreads = async (user: User): Promise<void> => {
  await Promise.all((await listThreads(user)).map((t) => deleteThread(t.thread_id)));
};

export const fetchVoiceToken = async (
  userId: number,
  threadId: string,
): Promise<{ url: string; token: string }> => {
  const q = new URLSearchParams({ user_id: String(userId), thread_id: threadId });
  const r = await fetch(`${FRIDAY_API}/voice/token?${q}`);
  if (!r.ok) throw new Error(`GET /voice/token -> ${r.status}`);
  return r.json();
};
