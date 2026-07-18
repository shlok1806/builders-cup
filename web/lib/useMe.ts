"use client";

import { useEffect, useState } from "react";
import { useUsers } from "@/lib/useUsers";

// "Who am I" — no auth. Seeds from the real roster (GET /api/users); the approval
// device's `?user=<id>` overrides it (never persisted); UserSwitcher persists a
// pick to localStorage.
const KEY = "cartel-me";

export function useMe() {
  const { users, byId } = useUsers();
  const [me, setMeState] = useState<string>("");

  // Mount/roster-load: URL override > localStorage > first real user. Runs again
  // when the async roster arrives so `me` lands on a real id when nothing stored.
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("user");
    const stored = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    const next = override ?? stored ?? users[0]?.id ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating client-only state
    if (next) setMeState(next);
  }, [users]);

  const setMe = (id: string) => {
    setMeState(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  return { me, setMe, users, byId };
}
