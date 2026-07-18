"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { browser } from "@/lib/supabase";

// Pending approval targeting the current user (shape from GET /api/approvals).
export type Pending = {
  id: string;
  purchaseId?: string;
  purchaseItemId: string;
  approverId?: string;
  rule: string;
  itemName: string;
  amountCents: number;
  recurringCartId?: string;
  recurringCartName?: string;
};

const Ctx = createContext<{ pending: Pending[]; latest: Pending | null; refresh: () => void }>({
  pending: [],
  latest: null,
  refresh: () => {},
});
export const useApprovals = () => useContext(Ctx);

// Seeds from GET /api/approvals?user=<me> (realtime only delivers events fired
// *after* subscribe, so an already-pending approval emits nothing), then either
// subscribes to `approvals` changes (NEXT_PUBLIC_REALTIME=1) or polls at 1.5s.
export function RealtimeProvider({ me, children }: { me: string; children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending[]>([]);

  const load = async () => {
    try {
      const r = await fetch(`/api/approvals?user=${encodeURIComponent(me)}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setPending(j.pending ?? []);
    } catch {}
  };

  useEffect(() => {
    if (!me) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch seed, state set in a later tick
    load(); // seed

    if (process.env.NEXT_PUBLIC_REALTIME === "1") {
      const sb = browser();
      // Any change to approvals → refetch (server filters to this approver).
      const ch = sb
        .channel("approvals")
        .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
        .subscribe();
      return () => { sb.removeChannel(ch); };
    }
    const t = setInterval(load, 1500); // poll fallback
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return <Ctx.Provider value={{ pending, latest: pending[0] ?? null, refresh: load }}>{children}</Ctx.Provider>;
}
