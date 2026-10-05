"use client";
import { useCallback, useEffect, useState } from "react";
import { MyRuntimeProvider } from "./MyRuntimeProvider";
import { Thread } from "@/components/Thread";
import { ThreadList } from "@/components/ThreadList";
import { Schedules } from "@/components/Schedules";
import { NewUserForm } from "@/components/NewUserForm";
import { DeleteUserButton } from "@/components/DeleteUserButton";
import { ConfigEditor } from "@/components/ConfigEditor";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUser } from "@/lib/useUser";

const SIDEBAR_KEY = "friday.sidebar";
const MOBILE = "(max-width: 767px)"; // Tailwind's md breakpoint

const btn =
  "rounded-lg border border-neutral-300 px-2 py-1 text-sm hover:bg-black/5 dark:border-neutral-700 dark:hover:bg-white/10";

export default function Home() {
  const { user, users, pick, add, drop, error } = useUser();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [registering, setRegistering] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  // desktop: remembered open/closed; phone: a drawer that starts closed
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    let open = !matchMedia(MOBILE).matches;
    try {
      if (open && localStorage.getItem(SIDEBAR_KEY) === "closed") open = false;
    } catch {
      /* no storage: default */
    }
    setSidebarOpen(open); // eslint-disable-line react-hooks/set-state-in-effect -- needs window, unknown during SSR
  }, []);

  const toggleSidebar = () =>
    setSidebarOpen((o) => {
      if (!matchMedia(MOBILE).matches) {
        try {
          localStorage.setItem(SIDEBAR_KEY, o ? "closed" : "open");
        } catch {
          /* fine */
        }
      }
      return !o;
    });

  // on a phone, picking a conversation closes the drawer
  const select = (id: string | undefined) => {
    setThreadId(id);
    if (matchMedia(MOBILE).matches) setSidebarOpen(false);
  };

  const refreshThreads = useCallback(() => setRefreshKey((n) => n + 1), []);
  // bumped when the open thread changed elsewhere: remounts the runtime so it reloads cleanly
  const [runtimeEpoch, setRuntimeEpoch] = useState(0);
  const reloadRuntime = useCallback(() => setRuntimeEpoch((n) => n + 1), []);

  const profile = (
    <div className="relative space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          value={user?.id ?? ""}
          onChange={(e) => {
            const next = users.find((u) => u.id === Number(e.target.value));
            if (next) {
              pick(next);
              setThreadId(undefined);
            }
          }}
          aria-label="Profile"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        <DeleteUserButton
          user={user}
          onDeleted={(u) => {
            drop(u);
            setThreadId(undefined);
          }}
        />
        <button onClick={() => setRegistering((r) => !r)} className={btn} title="New profile">
          +
        </button>
      </div>
      {registering && (
        <NewUserForm
          className="bottom-full left-0 right-0 mb-2"
          onCancel={() => setRegistering(false)}
          onCreated={(u) => {
            add(u);
            setThreadId(undefined);
            setRegistering(false);
          }}
        />
      )}
      <div className="flex gap-1.5">
        <ThemeToggle className={`${btn} flex-1 text-xs`} />
        <button onClick={() => setEditingConfig(true)} className={`${btn} flex-1 text-xs`} title="Edit config.yaml">
          ⚙ Config
        </button>
      </div>
    </div>
  );

  return (
    <main className="relative flex h-dvh overflow-hidden">
      {/* phone: dim the chat behind the open drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-auto md:transition-[margin] ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:-ml-64 md:translate-x-0"
        }`}
      >
        <ThreadList user={user} threadId={threadId} onSelect={select} refreshKey={refreshKey} footer={profile} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 sm:gap-3 sm:px-4 dark:border-neutral-800">
          <button onClick={toggleSidebar} className={`${btn} px-2.5`} aria-label="Toggle conversations" title="Conversations">
            ☰
          </button>
          <span className="font-semibold tracking-tight">Friday</span>
          {user && (
            <span className="hidden truncate text-xs text-neutral-400 sm:inline">
              {user.username}
              {user.location?.name && ` · ${user.location.name}`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Schedules key={threadId ?? "none"} user={user} threadId={threadId} />
          </div>
        </header>

        {error && (
          <p className="px-4 py-3 text-sm text-red-500">
            Could not reach the Friday API ({error}). Is the Telegram bot process running?
          </p>
        )}

        <MyRuntimeProvider
          key={`${user?.id ?? "none"}:${runtimeEpoch}`}
          user={user}
          threadId={threadId}
          onThreadIdChange={setThreadId}
          onThreadsChanged={refreshThreads}
          onExternalUpdate={reloadRuntime}
        >
          <Thread />
        </MyRuntimeProvider>
      </div>

      {editingConfig && <ConfigEditor onClose={() => setEditingConfig(false)} />}
    </main>
  );
}
