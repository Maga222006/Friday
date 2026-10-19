"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import {
  checkpointFor,
  forDisplay,
  getThread,
  getThreadState,
  POLL_MS,
  setThreadTitle,
  streamRun,
  type User,
} from "@/lib/chatApi";
import { createAegraThreadListAdapter } from "@/lib/aegraThreadList";
import { createLiveKitVoiceAdapter } from "@/lib/livekitVoice";
import { fileAttachments } from "@/lib/attachments";

/** The open thread's id while it has a run going on the server that this tab isn't
 *  streaming (started before a reload, in another tab…), else undefined. */
const BusyContext = createContext<string | undefined>(undefined);
export const useBusyThread = () => useContext(BusyContext);

const titleFrom = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";

export function MyRuntimeProvider({
  user,
  threadId,
  onThreadIdChange,
  onThreadsChanged,
  onExternalUpdate,
  children,
}: {
  user: User | null;
  threadId: string | undefined;
  onThreadIdChange: (id: string | undefined) => void;
  onThreadsChanged: () => void;
  /** remount this provider so the open thread loads from scratch (see the live refresh below) */
  onExternalUpdate: () => void;
  children: ReactNode;
}) {
  // filled after render; only read from voice callbacks, which run on user action
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  const [busyThread, setBusyThread] = useState<string | undefined>();
  const busy = threadId && busyThread === threadId ? threadId : undefined;

  const threadList = useMemo(() => createAegraThreadListAdapter(user), [user]);

  const voice = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the ref is read in callbacks, not during render
      createLiveKitVoiceAdapter({
        getUser: () => user,
        getThreadId: async () => {
          const item = runtimeRef.current!.threads.mainItem;
          return item.getState().remoteId ?? (await item.initialize()).remoteId;
        },
        // swap the live transcript for what the worker actually saved
        onEnded: () => {
          onExternalUpdate();
          onThreadsChanged();
        },
      }),
    [user, onThreadsChanged, onExternalUpdate],
  );

  const runtime = useLangGraphRuntime({
    unstable_allowCancellation: true,
    unstable_threadListAdapter: threadList,
    threadId,
    onThreadIdChange,
    adapters: { voice, attachments: fileAttachments },

    load: async (externalId) => {
      const state = await getThreadState(externalId);
      return {
        messages: forDisplay(state.values?.messages ?? []),
        interrupts: state.tasks?.[0]?.interrupts,
      };
    },

    // enables Edit (user messages) and Regenerate (assistant messages)
    getCheckpointId: checkpointFor,

    stream: async function* (messages, { abortSignal, initialize, checkpointId }) {
      if (!user) throw new Error("No profile selected");
      const { externalId, remoteId } = await initialize();
      const id = externalId ?? remoteId;

      // first turn of a fresh thread: name it from what was asked
      if (messages.length === 1) {
        const first = messages[0];
        const text =
          typeof first.content === "string"
            ? first.content
            : first.content
                .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
                .join(" ");
        setThreadTitle(id, titleFrom(text)).then(onThreadsChanged).catch(() => {});
      } else {
        onThreadsChanged();
      }

      for await (const chunk of streamRun(id, messages, user, abortSignal, checkpointId)) {
        yield chunk as never;
      }
    },
  });
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  // live refresh: when someone else wrote to the open thread (a schedule, Telegram),
  // load it from scratch. The runtime's in-place reload (reloadMainThread) puts
  // messages it didn't have *before* the ones on screen, so new replies showed up
  // above older messages; a fresh load keeps the server's order.
  useEffect(() => {
    if (!threadId) return;
    let last: string | undefined;
    let steps: number | undefined;
    let ownRun = false;
    const tick = async () => {
      if (document.hidden) return;
      const state = runtime.thread.getState();
      const inCall = state.voice && state.voice.status.type !== "ended";
      if (state.isRunning || inCall) {
        ownRun = true; // our own writes arrive via the stream / onEnded
        return;
      }
      try {
        const { updated_at, status } = await getThread(threadId);
        setBusyThread(status === "busy" ? threadId : undefined);
        const draft = runtime.thread.composer.getState();
        const typing = !!(draft.text.trim() || draft.attachments.length); // don't wipe it; retry next tick
        if (status === "busy") {
          // a run this tab isn't streaming: show each step as it's saved
          const n = (await getThreadState(threadId)).values?.messages?.length ?? 0;
          if (steps !== undefined && n !== steps && !typing) {
            onExternalUpdate();
            return;
          }
          steps = n;
        }
        if (ownRun) {
          ownRun = false; // the change is our own finished run: just move the baseline
        } else if (last !== undefined && updated_at !== last) {
          if (typing) return;
          onExternalUpdate();
          onThreadsChanged();
          return;
        }
        last = updated_at;
      } catch (e) {
        // deleted elsewhere (e.g. another tab): fall back to a new chat
        if ((e as { status?: number }).status === 404) onThreadIdChange(undefined);
        /* otherwise Aegra is down: try again next tick */
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick); // catch up after a background tab
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [threadId, runtime, onThreadsChanged, onThreadIdChange, onExternalUpdate]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <BusyContext.Provider value={busy}>{children}</BusyContext.Provider>
    </AssistantRuntimeProvider>
  );
}
