"use client";
import { useEffect, useState } from "react";
import {
  useAuiState,
  type EmptyMessagePartComponent,
  type ReasoningMessagePartComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { describeCall, thoughtTitle, useSubagentRun, type SubRun } from "@/lib/subagentProgress";
import { useBusyThread } from "@/app/MyRuntimeProvider";

/* ---------------------------------------------------------------- helpers */

/** Seconds since `active` was first seen true; frozen once it turns false. null if never seen live. */
function useElapsed(active: boolean): number | null {
  const [span, setSpan] = useState<{ start: number; now: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () =>
      setSpan((s) => {
        const now = Date.now();
        return { start: s?.start ?? now, now };
      });
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      tick(); // freeze at the final duration
    };
  }, [active]);
  return span && Math.max(0, Math.round((span.now - span.start) / 1000));
}

const Spinner = () => (
  <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70" />
);

const Chevron = ({ open, push = false }: { open: boolean; push?: boolean }) => (
  <span className={`${push ? "ml-auto " : ""}shrink-0 opacity-50 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
);

const short = (v: unknown, max = 600) => {
  const t = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/* --------------------------------------------------------------- thinking */

/** The model's thought summary: open and live while it thinks, collapsed once it answers. */
export const Reasoning: ReasoningMessagePartComponent = ({ text, status }) => {
  const live = status.type === "running";
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? live;
  const seconds = useElapsed(live);
  const title = thoughtTitle(text);
  return (
    <div className="my-1 rounded-lg border border-black/10 text-xs dark:border-white/10">
      <button
        type="button"
        onClick={() => setToggled(!open)}
        className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-neutral-500 select-none dark:text-neutral-400"
      >
        <span>💭</span>
        <span className={`shrink-0 font-medium ${live ? "animate-pulse" : ""}`}>
          {live ? "Thinking" : seconds ? `Thought for ${seconds}s` : "Thoughts"}
        </span>
        {title && <span className="truncate italic opacity-80">· {title}</span>}
        <Chevron open={open} push />
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-black/10 px-3 py-1.5 text-neutral-600 dark:border-white/10 dark:text-neutral-400">
          <MarkdownText />
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------- tool calls */

const ICONS: Record<string, string> = {
  task: "🔬",
  start_async_task: "🛰️",
  check_async_task: "🛰️",
  update_async_task: "🛰️",
  cancel_async_task: "🛰️",
  list_async_tasks: "🛰️",
  schedule: "⏰",
  list_schedules: "⏰",
  cancel_schedule: "⏰",
  remember: "🧠",
  recall: "🧠",
  forget: "🧠",
  weather: "🌤️",
  current_time: "🕒",
  push_on_telegram: "✈️",
  get_device_list: "🏠",
  change_device_states: "🏠",
};

/** One line saying what the call is about, e.g. the research question or the search query. */
const detailOf = (toolName: string, args: Record<string, unknown> | undefined) => {
  if (!args) return "";
  if (toolName === "task" || toolName === "start_async_task") {
    const who = typeof args.subagent_type === "string" ? args.subagent_type : "";
    const what = typeof args.description === "string" ? args.description : "";
    return [who, what].filter(Boolean).join(": ");
  }
  if (toolName === "schedule") return [args.cron, args.prompt].filter((v) => typeof v === "string").join(" · ");
  const label = describeCall(toolName, args);
  return label === toolName ? "" : label.replace(`${toolName}: `, "");
};

/** The subagent's steps, live: searches, pages read, the latest thought, writing. */
function SubagentSteps({ run, live }: { run: SubRun; live: boolean }) {
  return (
    <ol className="space-y-0.5 border-t border-black/10 px-2 py-1.5 text-neutral-600 dark:border-white/10 dark:text-neutral-400">
      {run.steps.map((s) => (
        <li key={s.id} className="flex min-w-0 items-center gap-1.5">
          {s.state === "running" && live ? <Spinner /> : <span className={s.state === "error" ? "text-red-500" : "text-emerald-600"}>{s.state === "error" ? "✕" : "✓"}</span>}
          <span className="truncate">{s.label}</span>
        </li>
      ))}
      {live && run.thought && (
        <li className="flex min-w-0 items-center gap-1.5 italic opacity-80">
          <span>💭</span>
          <span className="truncate">{run.thought}</span>
        </li>
      )}
      {live && run.writing && (
        <li className="flex items-center gap-1.5">
          <Spinner />
          <span>Writing the answer</span>
        </li>
      )}
    </ol>
  );
}

/**
 * Every tool call, inline: "🌤️ weather · Linz · 2s". While it runs it shows a spinner and
 * a timer; for subagents also their live steps. Click for the arguments and the result.
 */
export const ToolCall: ToolCallMessagePartComponent = ({ toolCallId, toolName, args, result, status, isError }) => {
  // running here, or in a run this tab isn't streaming (started before a reload)
  const streaming = useAuiState((s) => s.thread.isRunning);
  const busyThread = useBusyThread();
  const threadRunning = streaming || !!busyThread;
  const run = useSubagentRun(toolCallId);
  const [open, setOpen] = useState(false);

  const failed = isError || status.type === "incomplete";
  const state =
    failed ? "failed"
    : result !== undefined ? "done"
    : status.type === "running" || threadRunning ? "running"
    : "no result"; // the run stopped before the tool answered
  const active = state === "running";
  const seconds = useElapsed(active);
  const detail = detailOf(toolName, args);
  const showSteps = run && (run.steps.length > 0 || run.thought || run.writing) && (active || open);

  return (
    <div className="my-1 rounded-lg border border-black/10 text-xs dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-neutral-600 select-none dark:text-neutral-400"
      >
        <span>{ICONS[toolName] ?? "🔧"}</span>
        <span className="shrink-0 font-mono font-medium text-neutral-800 dark:text-neutral-200">{toolName}</span>
        {detail && <span className="truncate opacity-80">· {detail}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {active ? (
            <>
              <Spinner />
              <span className="tabular-nums">{seconds ?? 0}s</span>
            </>
          ) : (
            <span className={failed ? "text-red-500" : state === "no result" ? "opacity-60" : "text-emerald-600"}>
              {failed ? "failed" : state === "no result" ? "no result" : `✓${seconds ? ` ${seconds}s` : ""}`}
            </span>
          )}
        </span>
        <Chevron open={open} />
      </button>
      {showSteps && <SubagentSteps run={run} live={active} />}
      {open && (
        <div className="space-y-1.5 border-t border-black/10 px-2 py-1.5 dark:border-white/10">
          {args && Object.keys(args).length > 0 && (
            <pre className="overflow-x-auto font-mono whitespace-pre-wrap opacity-80">{short(args)}</pre>
          )}
          {result !== undefined && (
            <pre className="max-h-60 overflow-auto font-mono whitespace-pre-wrap">{short(result, 2000)}</pre>
          )}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- working */

/** The reply before anything streamed in (model starting up): a quiet "working" line. */
export const Working: EmptyMessagePartComponent = ({ status }) =>
  status.type === "running" ? (
    <div className="flex items-center gap-2 py-0.5 text-xs text-neutral-500">
      <Spinner />
      <span className="animate-pulse">Friday is working…</span>
    </div>
  ) : null;
