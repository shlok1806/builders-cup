"use client";

import { useEffect, useState } from "react";

// The running cart is the household's SHARED building purchase, resolved from the
// server (GET /api/cart/active) — NOT per-browser localStorage. We poll so every
// member sees adds/removes within a few seconds; a local edit dispatches bc:cart
// for an instant refetch, and we also refetch on window focus.
// ponytail: 4s poll instead of Supabase realtime — matches the approvals fallback
// pattern and needs no publication/migration. Swap to postgres_changes if the
// household ever needs sub-second cart sync.
const EVENT = "bc:cart";
const POLL_MS = 4000;

type Cart = { cartId: string | null; count: number };

async function fetchActive(): Promise<Cart> {
  const r = await fetch("/api/cart/active", { cache: "no-store" });
  const j = await r.json();
  return { cartId: j.cartId ?? null, count: j.count ?? 0 };
}

// Nudge every useCart consumer to refetch now — call after a local add/remove/
// checkout so the badge and cart reflect the change immediately.
export function refreshCart() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// Back-compat shims: callers used setCart/clearCart to write localStorage. The
// cart now lives on the server, so these just trigger a shared refetch. They
// still accept the old (id, count) args so existing call sites compile unchanged.
export function setCart(...args: unknown[]) {
  void args;
  refreshCart();
}
export function clearCart() {
  refreshCart();
}

export function useCart(): Cart {
  const [state, setState] = useState<Cart>({ cartId: null, count: 0 });
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const c = await fetchActive();
        if (alive) setState(c);
      } catch {
        /* transient — keep last known cart */
      }
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("focus", sync);
    const id = setInterval(sync, POLL_MS);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("focus", sync);
      clearInterval(id);
    };
  }, []);
  return state;
}
