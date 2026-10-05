"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Thread } from "@langchain/langgraph-sdk";
import {
  countCrons,
  deleteThread,
  listThreads,
  POLL_MS,
  threadChannel,
  threadTitle,
  type User,
} from "@/lib/chatApi";

const BADGE: Record<string, string> = { telegram: "TG", voice: "voice" };

const signature = (ts: Thread[]) =>
  ts.map((t) => `${t.thread_id}|${t.updated_at}|${threadTitle(t)}`).join("\n");

export function ThreadList({
  user,
  threadId,
  onSelect,
  refreshKey,
  footer,
}: {
  user: User | null;
  threadId: string | undefined;
  onSelect: (id: string | undefined) => void;
  refreshKey: number;
  /** pinned under the list (profile, settings) */
  footer?: ReactNode;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const inFlight = useRef(false);
  const queued = useRef(false);

  // one request at a time; a refresh asked for while busy runs once, after
  const load = useCallback(async () => {
    if (!user) return setThreads([]);
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const next = await listThreads(user);
      // re-render only when something visible changed
      setThreads((prev) => (signature(prev) === signature(next) ? prev : next));
    } catch {
      /* keep the previous list rather than blanking the sidebar */
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void load();
      }
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // live: threads created/deleted elsewhere (Telegram bot, schedules, other tabs)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVisible = () => !document.hidden && void load(); // catch up after a background tab
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const remove = async (t: Thread) => {
    const schedules = await countCrons(t.thread_id).catch(() => 0);
    const lines = [`Delete "${threadTitle(t)}"?`];
    if (schedules) lines.push(`Its ${schedules} schedule${schedules === 1 ? "" : "s"} will be deleted too.`);
    if (threadChannel(t) === "telegram") lines.push("The bot starts a fresh one on your next Telegram message.");
    if (!window.confirm(lines.join("\n\n"))) return;

    setThreads((ts) => ts.filter((x) => x.thread_id !== t.thread_id)); // optimistic
    if (t.thread_id === threadId) onSelect(undefined);
    try {
      await deleteThread(t.thread_id);
    } finally {
      void load();
    }
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-200 bg-background dark:border-neutral-800">
      <button
        onClick={() => onSelect(undefined)}
        className="m-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        + New chat
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {threads.length === 0 && (
          <p className="px-2 py-4 text-xs text-neutral-400">No conversations yet.</p>
        )}
        {threads.map((t) => {
          const active = t.thread_id === threadId;
          const badge = BADGE[threadChannel(t)];
          return (
            <div
              key={t.thread_id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                active
                  ? "bg-neutral-100 dark:bg-neutral-900"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
              }`}
            >
              <button
                onClick={() => onSelect(t.thread_id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={threadTitle(t)}
              >
                {badge && (
                  <span className="shrink-0 rounded bg-sky-100 px-1 text-[10px] font-medium uppercase text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    {badge}
                  </span>
                )}
                <span className="truncate">{threadTitle(t)}</span>
              </button>
              <button
                onClick={() => remove(t)}
                className="px-1 text-neutral-400 hover:text-red-500 sm:invisible sm:group-hover:visible"
                aria-label="Delete conversation"
              >
                x
              </button>
            </div>
          );
        })}
      </div>
      {footer && <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">{footer}</div>}
    </aside>
  );
}
