"use client";

import { useEffect, useState } from "react";
import { people } from "@/lib/data";

// Real household roster (from GET /api/users). Replaces the mock lib/data.people
// ids so "who am I" resolves to seeded UUIDs. Module-cached: one fetch per load,
// falls back to the mock people on error so the UI never renders empty offline.
export type AppUser = { id: string; name: string; initials: string; color: string };

const initialsOf = (name: string) => {
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
};

const fallback: AppUser[] = people.map((p) => ({
  id: p.id, name: p.name, initials: p.initials, color: p.color,
}));

let cache: AppUser[] | null = null;
let inflight: Promise<AppUser[]> | null = null;

function load(): Promise<AppUser[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/users")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((j) =>
        (j.users as { id: string; name: string; color: string }[]).map((u) => ({
          ...u, initials: initialsOf(u.name),
        })),
      )
      .then((u) => (cache = u.length ? u : fallback))
      .catch(() => (cache = fallback));
  }
  return inflight;
}

export function useUsers() {
  const [users, setUsers] = useState<AppUser[]>(cache ?? fallback);
  useEffect(() => {
    let alive = true;
    load().then((u) => alive && setUsers(u));
    return () => { alive = false; };
  }, []);
  const byId = Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, AppUser>;
  return { users, byId };
}
