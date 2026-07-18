"use client";

import { useEffect, useState } from "react";

// The running cart is a single Supabase purchase (status "building"). We only
// keep its id + item count on the client; /checkout reconciles count from the
// server on load. ponytail: one active cart per browser, no auth-scoped store —
// fine for this single-household demo. Upgrade to a per-user server cart if the
// app ever grows real accounts.
const ID_KEY = "bc.cartId";
const COUNT_KEY = "bc.cartCount";
const EVENT = "bc:cart";

function read(): { cartId: string | null; count: number } {
  if (typeof window === "undefined") return { cartId: null, count: 0 };
  return {
    cartId: localStorage.getItem(ID_KEY),
    count: Number(localStorage.getItem(COUNT_KEY) || 0),
  };
}

export function setCart(cartId: string, count: number) {
  localStorage.setItem(ID_KEY, cartId);
  localStorage.setItem(COUNT_KEY, String(Math.max(0, count)));
  window.dispatchEvent(new Event(EVENT));
}

export function clearCart() {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(COUNT_KEY);
  window.dispatchEvent(new Event(EVENT));
}

// Reactive read for the tab-bar badge — syncs on our own event (same tab) and
// the native storage event (other tabs).
export function useCart(): { cartId: string | null; count: number } {
  const [state, setState] = useState<{ cartId: string | null; count: number }>({ cartId: null, count: 0 });
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return state;
}
