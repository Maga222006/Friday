import { useSyncExternalStore } from "react";

/**
 * Live progress of subagents (the `task` tool), shown inside that tool call's card.
 *
 * With `streamSubgraphs`, Aegra also streams what a subagent does. Its namespace nests
 * under the main agent's tool task: "tools:<task>|model:<id>". Those events must not
 * reach the runtime: react-langgraph would add the subagent's own messages to the chat.
 * They are turned into steps here instead, keyed by the main agent's tool_call_id.
 */

export type SubStep = { id: string; label: string; state: "running" | "done" | "error" };
export type SubRun = { agent?: string; steps: SubStep[]; thought?: string; writing: boolean };

type Msg = {
  id?: string;
  type?: string;
  content?: unknown;
  tool_calls?: { id?: string; name: string; args: Record<string, unknown> }[];
  tool_call_id?: string;
  status?: string;
};
type Event = { event: string; data: unknown };

/* ------------------------------------------------------------------ store */

const runs = new Map<string, SubRun>();
const listeners = new Set<() => void>();

const update = (callId: string, fn: (r: SubRun) => SubRun) => {
  runs.set(callId, fn(runs.get(callId) ?? { steps: [], writing: false }));
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What the subagent behind this tool call is doing (only for runs streamed in this tab). */
export const useSubagentRun = (toolCallId: string): SubRun | undefined =>
  useSyncExternalStore(subscribe, () => runs.get(toolCallId), () => undefined);

/* ------------------------------------------------------------- formatting */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const host = (u: unknown) => {
  try {
    return new URL(str(u)).hostname.replace(/^www\./, "");
  } catch {
    return str(u);
  }
};

/** "Searching “python release”", "Reading python.org, …" */
export const describeCall = (name: string, args: Record<string, unknown> = {}): string => {
  switch (name) {
    case "tavily_search":
      return `Searching ${/["“]/.test(str(args.query)) ? str(args.query) : `“${str(args.query)}”`}`;
    case "tavily_extract": {
      const urls = Array.isArray(args.urls) ? args.urls : [];
      return `Reading ${urls.slice(0, 3).map(host).join(", ")}${urls.length > 3 ? ` +${urls.length - 3}` : ""}`;
    }
    case "yahoo_finance_news":
      return `Finance news for ${str(args.query)}`;
    case "task":
      return `Asking ${str(args.subagent_type) || "a subagent"}`;
    default: {
      const first = Object.values(args).find((v) => typeof v === "string");
      return first ? `${name}: ${str(first)}` : name;
    }
  }
};

/** Gemini thought summaries start with a bold title: "**Checking the release notes**" */
export const thoughtTitle = (text: string): string | undefined => {
  const titles = [...text.matchAll(/\*\*(.+?)\*\*/g)];
  return titles.at(-1)?.[1] ?? text.trim().split("\n")[0]?.slice(0, 80);
};

const blocks = (content: unknown): Record<string, unknown>[] =>
  Array.isArray(content) ? content.filter((b) => b && typeof b === "object") : [];

/* ----------------------------------------------------------------- stream */

const messagesOf = (data: unknown): Msg[] => {
  if (!data || typeof data !== "object") return [];
  return Object.values(data as Record<string, { messages?: unknown }>).flatMap((u) =>
    u && Array.isArray(u.messages) ? (u.messages as Msg[]) : [],
  );
};

/** Steps from one subagent `updates` event: its tool calls, their results, its answer. */
const onSubUpdate = (callId: string, data: unknown) => {
  for (const m of messagesOf(data)) {
    if (m.type === "ai" && m.tool_calls?.length) {
      const calls = m.tool_calls;
      update(callId, (r) => ({
        ...r,
        writing: false,
        steps: [
          ...r.steps,
          ...calls
            .filter((c) => !r.steps.some((s) => s.id === c.id))
            .map((c) => ({ id: c.id ?? crypto.randomUUID?.() ?? String(Math.random()), label: describeCall(c.name, c.args), state: "running" as const })),
        ],
      }));
    } else if (m.type === "tool") {
      update(callId, (r) => ({
        ...r,
        steps: r.steps.map((s) => (s.id === m.tool_call_id ? { ...s, state: m.status === "error" ? "error" : "done" } : s)),
      }));
    }
  }
};

/** A subagent message still streaming: its latest thought, or that it's writing the answer. */
const onSubPartial = (callId: string, m: Msg) => {
  if (m.type !== "ai") return; // its tool results arrive through updates
  const parts = blocks(m.content);
  const thinking = parts.filter((b) => b.type === "thinking" || b.type === "reasoning").map((b) => str(b.thinking) || str(b.reasoning)).join("\n");
  const writing = !m.tool_calls?.length && (typeof m.content === "string" ? m.content.length > 0 : parts.some((b) => b.type === "text" && str(b.text)));
  update(callId, (r) => ({ ...r, thought: thinking ? thoughtTitle(thinking) : r.thought, writing }));
};

/**
 * Passes the main agent's events through unchanged and turns subagent events into
 * progress. A subagent run is matched to the oldest `task` call still without one
 * (they start in call order); the result message of each `task` call names its
 * namespace, which corrects the match if parallel calls started out of order.
 */
export async function* withSubagentProgress<T extends Event>(events: AsyncIterable<T>): AsyncGenerator<T> {
  const subMessages = new Map<string, string>(); // message id → subagent namespace
  const resultNs = new Map<string, string>(); // main tool result message id → its namespace
  const waiting: string[] = []; // task calls that no subagent run has claimed yet
  const seen = new Set<string>();
  const nsCall = new Map<string, string>(); // "tools:<task>" → tool_call_id

  const callFor = (ns: string) => {
    let id = nsCall.get(ns);
    if (!id && waiting.length) {
      id = waiting.shift()!;
      nsCall.set(ns, id);
    }
    return id;
  };
  const confirm = (ns: string, callId: string) => {
    const was = nsCall.get(ns);
    if (!was || was === callId) return;
    // swap the two runs that were matched the wrong way round
    const a = runs.get(was);
    const b = runs.get(callId);
    if (b) runs.set(was, b);
    else runs.delete(was);
    if (a) runs.set(callId, a);
    for (const [k, v] of nsCall) if (v === callId) nsCall.set(k, was);
    nsCall.set(ns, callId);
    listeners.forEach((l) => l());
  };

  for await (const ev of events) {
    const bar = ev.event.indexOf("|");
    if (bar >= 0) {
      // "updates|tools:<task>|…": a subagent step (nested subagents count as the outer one)
      const ns = ev.event.slice(bar + 1).split("|")[0];
      const callId = callFor(ns);
      if (callId && ev.event.startsWith("updates")) onSubUpdate(callId, ev.data);
      continue;
    }

    if (ev.event === "messages/metadata") {
      for (const [id, v] of Object.entries((ev.data ?? {}) as Record<string, { metadata?: Record<string, unknown> }>)) {
        const md = v?.metadata ?? {};
        const ns = str(md.langgraph_checkpoint_ns);
        if (ns.includes("|")) {
          const top = ns.split("|")[0];
          subMessages.set(id, top);
          const callId = callFor(top);
          if (callId && md.lc_agent_name) update(callId, (r) => (r.agent ? r : { ...r, agent: str(md.lc_agent_name) }));
        } else if (ns.startsWith("tools:")) {
          resultNs.set(id, ns);
        }
      }
      continue; // react-langgraph has no use for these
    }

    if (ev.event === "messages/partial" || ev.event === "messages/complete") {
      const own: Msg[] = [];
      for (const m of (Array.isArray(ev.data) ? ev.data : []) as Msg[]) {
        const ns = m.id ? subMessages.get(m.id) : undefined;
        if (ns) {
          const callId = callFor(ns);
          if (callId) onSubPartial(callId, m);
          continue;
        }
        if (m.type === "tool" && m.id && m.tool_call_id && resultNs.has(m.id)) confirm(resultNs.get(m.id)!, m.tool_call_id);
        own.push(m);
      }
      if (own.length) yield { ...ev, data: own };
      continue;
    }

    if (ev.event === "updates") {
      for (const m of messagesOf(ev.data)) {
        for (const c of m.type === "ai" ? (m.tool_calls ?? []) : []) {
          if (c.name === "task" && c.id && !seen.has(c.id)) {
            seen.add(c.id);
            waiting.push(c.id);
          }
        }
        if (m.type === "tool" && m.tool_call_id && runs.has(m.tool_call_id)) {
          update(m.tool_call_id, (r) => ({ ...r, writing: false }));
        }
      }
    }
    yield ev;
  }
}
