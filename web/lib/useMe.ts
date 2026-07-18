"use client";

import { useEffect, useState } from "react";
import { useUsers } from "@/lib/useUsers";
import { ME_COOKIE } from "@/lib/auth";

// "Who am I" — set by mock login (POST /api/login sets the cartel-me cookie).
// The approval device's `?user=<id>` still overrides it. The proxy guard means
// any non-approve page reached here already has the cookie.
function readCookie(name: string): string {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : "";
}

export function useMe() {
  const { users, byId } = useUsers();
  const [me, setMeState] = useState<string>("");

  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("user");
    const next = override ?? readCookie(ME_COOKIE);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating client-only state
    if (next) setMeState(next);
  }, [users]);

  return { me, users, byId };
}
