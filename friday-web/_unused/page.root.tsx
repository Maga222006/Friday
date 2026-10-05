"use client";
import { Thread } from "@assistant-ui/react";
import { MyRuntimeProvider } from "./MyRuntimeProvider";
import { useUser } from "@/lib/useUser";

export default function Home() {
  const { user, all, pick } = useUser();
  return (
    <MyRuntimeProvider>
      <main className="h-dvh flex flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <span className="font-medium">Friday</span>
          <select
            className="ml-auto rounded border px-2 py-1 text-sm"
            value={user?.id ?? ""}
            onChange={(e) => pick(all.find(u => u.id === +e.target.value)!)}
          >
            {all.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </header>
        <Thread />
      </main>
    </MyRuntimeProvider>
  );
}