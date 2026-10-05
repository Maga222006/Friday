"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { listUsers, type User } from "./chatApi";

type Store = {
  users: User[];
  user: User | null;
  pickUser: (u: User) => void;
  threadId: string | undefined;
  setThreadId: (id: string | undefined) => void;
  /** bump to make the thread list refetch */
  version: number;
  refresh: () => void;
  error: string | null;
};

const Ctx = createContext<Store | null>(null);
const SAVED = "friday.user";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((us) => {
        setUsers(us);
        const saved = localStorage.getItem(SAVED);
        setUser(us.find((u) => String(u.id) === saved) ?? us[0] ?? null);
      })
      .catch((e) =>
        setError(
          `Could not reach the Friday API (${String(e)}). Is the Telegram bot running?`,
        ),
      );
  }, []);

  const pickUser = useCallback((u: User) => {
    localStorage.setItem(SAVED, String(u.id));
    setUser(u);
    setThreadId(undefined); // different person, different conversation
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ users, user, pickUser, threadId, setThreadId, version, refresh, error }),
    [users, user, pickUser, threadId, version, refresh, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}
