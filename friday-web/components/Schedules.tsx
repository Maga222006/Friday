"use client";
import { useEffect, useState } from "react";
import type { Cron } from "@langchain/langgraph-sdk";
import { createCron, deleteCron, getThread, listCrons, type User } from "@/lib/chatApi";

// cron day-of-week numbers, Monday first
const DAYS = [
  ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0],
] as const;
const DAY_NAME = Object.fromEntries(DAYS.map(([n, d]) => [d, n]));

const describe = (c: Cron) => {
  const m = c.schedule.match(/^(\d+) (\d+) \* \* (\S+)$/);
  if (!m) return c.schedule;
  const time = `${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}`;
  const days = m[3] === "*" ? "daily" : m[3].split(",").map((d) => DAY_NAME[Number(d)] ?? d).join(" ");
  return `${time} · ${days}`;
};

const promptOf = (c: Cron) => {
  const input = c.payload?.input as { messages?: { content?: unknown }[] } | undefined;
  const content = input?.messages?.[0]?.content;
  return typeof content === "string" ? content : "";
};

/** Recurring prompts bound to the open thread; each run's reply lands in it. */
export function Schedules({ user, threadId }: { user: User | null; threadId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [crons, setCrons] = useState<Cron[]>([]);
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<number[]>(DAYS.map(([, d]) => d));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = user?.location?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!threadId) return;
    let stale = false;
    listCrons(threadId)
      .then((cs) => !stale && setCrons(cs))
      .catch(() => {}); // keep what we had
    return () => {
      stale = true;
    };
  }, [threadId, version]);

  if (!threadId || !user) return null;

  const add = async () => {
    if (!prompt.trim() || days.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const [h, m] = time.split(":").map(Number);
      const dow = days.length === 7 ? "*" : [...days].sort().join(",");
      await createCron(await getThread(threadId), user, {
        schedule: `${m} ${h} * * ${dow}`,
        prompt: prompt.trim(),
        timezone,
      });
      setPrompt("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setCrons((cs) => cs.filter((c) => c.cron_id !== id));
    await deleteCron(id).catch(() => {});
    reload();
  };

  const toggleDay = (d: number) =>
    setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700"
      >
        Schedules{crons.length ? ` (${crons.length})` : ""}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
          <p className="mb-2 text-xs text-neutral-400">
            Runs on this thread · {timezone}
          </p>

          {crons.length === 0 && <p className="mb-2 text-xs text-neutral-400">Nothing scheduled.</p>}
          <ul className="mb-3 space-y-1">
            {crons.map((c) => (
              <li key={c.cron_id} className="group flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{describe(c)}</div>
                  <div className="truncate text-xs text-neutral-500" title={promptOf(c)}>
                    {promptOf(c)}
                  </div>
                </div>
                <button
                  onClick={() => remove(c.cron_id)}
                  className="invisible px-1 text-neutral-400 group-hover:visible hover:text-red-500"
                  aria-label="Delete schedule"
                >
                  x
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value || "08:00")}
                className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
              />
              <div className="flex gap-0.5">
                {DAYS.map(([name, d]) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`w-7 rounded py-1 text-[10px] ${
                      days.includes(d)
                        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-neutral-400"
                    }`}
                  >
                    {name.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should Friday do? e.g. Brief me on today's weather"
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={add}
              disabled={busy || !prompt.trim() || days.length === 0}
              className="w-full rounded-lg bg-neutral-900 py-1.5 text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {busy ? "Adding…" : "Add schedule"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
