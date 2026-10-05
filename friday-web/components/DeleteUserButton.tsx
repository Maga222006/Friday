"use client";
import { useState } from "react";
import { deleteUser, listThreads, purgeUserThreads, type User } from "@/lib/chatApi";

/** Removes the profile (the API also purges its memories), then its threads
 *  and their schedules. The DB row goes first so the bot stops recreating the
 *  Telegram thread while we clean up. */
export function DeleteUserButton({ user, onDeleted }: { user: User | null; onDeleted: (u: User) => void }) {
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const remove = async () => {
    setBusy(true);
    try {
      const threads = await listThreads(user).then((ts) => ts.length, () => 0);
      const ok = window.confirm(
        `Delete profile "${user.username}"?\n\n` +
          `This also deletes ${threads} conversation${threads === 1 ? "" : "s"} (with their schedules) ` +
          `and everything Friday remembers about them. This can't be undone.`,
      );
      if (!ok) return;
      await deleteUser(user.id);
      await purgeUserThreads(user);
      onDeleted(user);
    } catch (e) {
      window.alert(`Couldn't delete the profile: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-500 hover:text-red-500 disabled:opacity-40 dark:border-neutral-700"
      title="Delete profile"
    >
      {busy ? "…" : "−"}
    </button>
  );
}
