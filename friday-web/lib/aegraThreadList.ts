import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import type { Thread } from "@langchain/langgraph-sdk";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  setThreadTitle,
  threadTitle,
  type User,
} from "./chatApi";

const toMeta = (t: Thread) => ({
  status: "regular" as const,
  remoteId: t.thread_id,
  externalId: t.thread_id,
  title: threadTitle(t),
  lastMessageAt: new Date(t.updated_at),
});

/** Thread list backed by Aegra, so the runtime can open any existing thread
 *  (the in-memory default can't `fetch`, which made switching fail silently). */
export function createAegraThreadListAdapter(user: User | null): RemoteThreadListAdapter {
  return {
    list: async () => ({ threads: user ? (await listThreads(user)).map(toMeta) : [] }),
    fetch: async (threadId) => toMeta(await getThread(threadId)),
    initialize: async () => {
      if (!user) throw new Error("No profile selected");
      const { thread_id } = await createThread(user);
      return { remoteId: thread_id, externalId: thread_id };
    },
    rename: async (remoteId, title) => void (await setThreadTitle(remoteId, title)),
    delete: async (remoteId) => void (await deleteThread(remoteId)),
    archive: async () => {},
    unarchive: async () => {},
    // titles are set from the first message in MyRuntimeProvider.stream
    generateTitle: async () =>
      new ReadableStream({ start: (c) => c.close() }) as unknown as Awaited<
        ReturnType<RemoteThreadListAdapter["generateTitle"]>
      >,
  };
}
