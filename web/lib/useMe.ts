"use client";

import { useEffect, useState } from "react";
import { people } from "@/lib/data";

// "Who am I" — no auth. UserSwitcher persists to localStorage; the approval
// device's `?user=<id>` overrides it (and is never persisted).
const KEY = "cartel-me";

export function useMe() {
  const [me, setMeState] = useState<string>(people[0].id);

  // Mount-only read of browser state (URL/localStorage) — kept in an effect so
  // SSR renders the default and the client hydrates it (no mismatch).
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("user");
    const next = override ?? (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating client-only state on mount
    if (next) setMeState(next);
  }, []);

  const setMe = (id: string) => {
    setMeState(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  return { me, setMe, users: people };
}
