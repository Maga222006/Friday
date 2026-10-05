"use client";
import { useState } from "react";
import { createUser, type User } from "@/lib/chatApi";

/** Registers a profile (POST /users); the location is geocoded server-side. */
export function NewUserForm({
  onCreated,
  onCancel,
  className = "right-0 top-full mt-2 w-72",
}: {
  onCreated: (u: User) => void;
  onCancel: () => void;
  /** where the popover sits relative to its trigger */
  className?: string;
}) {
  const [username, setUsername] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createUser({
          username: username.trim(),
          telegram_id: telegramId.trim() || undefined,
          location: location.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700";

  return (
    <form
      onSubmit={submit}
      className={`absolute z-20 space-y-2 ${className} rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-950`}
    >
      <p className="font-medium">New profile</p>
      <input autoFocus required placeholder="Name" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
      <input placeholder="Telegram ID (optional)" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} className={field} />
      <input placeholder="City (optional), e.g. Linz" value={location} onChange={(e) => setLocation(e.target.value)} className={field} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-neutral-300 py-1.5 dark:border-neutral-700">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {busy ? "Saving…" : "Create"}
        </button>
      </div>
    </form>
  );
}
