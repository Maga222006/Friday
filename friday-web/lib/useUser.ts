"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchUsers, type User } from "./chatApi";

const KEY = "friday.user";

export function useUser() {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers()
      .then((all) => {
        setUsers(all);
        const saved = localStorage.getItem(KEY);
        setUser(all.find((u) => String(u.id) === saved) ?? all[0] ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const pick = useCallback((u: User) => {
    localStorage.setItem(KEY, String(u.id));
    setUser(u);
  }, []);

  /** A freshly registered profile: list it and switch to it. */
  const add = useCallback(
    (u: User) => {
      setUsers((all) => [...all.filter((x) => x.id !== u.id), u]);
      pick(u);
    },
    [pick],
  );

  /** A deleted profile: drop it and fall back to the first remaining one. */
  const drop = useCallback(
    (u: User) => {
      const rest = users.filter((x) => x.id !== u.id);
      setUsers(rest);
      if (user?.id === u.id) {
        localStorage.removeItem(KEY);
        setUser(rest[0] ?? null);
      }
    },
    [users, user],
  );

  return { user, users, pick, add, drop, error };
}
