"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import CartInput from "@/components/CartInput";
import CartView from "@/components/CartView";
import SplitView from "@/components/SplitView";
import { mockCart, mockSplitLines, type CartResult } from "@/lib/data";
import { useMe } from "@/lib/useMe";
import type { SplitLineView } from "@/lib/split-run";

// F2/F4 UI — build cart → split. Wires to P2 (/api/cart/build) and P3
// (/api/purchase/[id]/split); falls back to seed data so it demos offline.
export default function CartPage() {
  const { me } = useMe();
  const [cart, setCart] = useState<CartResult | null>(null);
  const [lines, setLines] = useState<SplitLineView[] | null>(null);
  const [busy, setBusy] = useState(false);

  const build = async (text: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/cart/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, userId: me }),
      });
      setCart(r.ok ? await r.json() : mockCart);
    } catch {
      setCart(mockCart); // model/route down → canonical demo cart
    } finally {
      setBusy(false);
    }
  };

  const split = async () => {
    if (!cart) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase/${cart.purchaseId}/split`, { method: "POST" });
      const j = r.ok ? await r.json() : null;
      setLines(j?.lines ?? mockSplitLines);
    } catch {
      setLines(mockSplitLines);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href="/" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="home" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">
          {!cart ? "New cart" : lines ? "The split" : "Your cart"}
        </h1>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {!cart && <CartInput onBuild={build} loading={busy} />}
        {cart && !lines && <CartView cart={cart} />}
        {lines && <SplitView lines={lines} />}
      </main>

      {cart && !lines && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-5 pt-3 pb-8">
          <button
            onClick={split}
            disabled={busy}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent disabled:opacity-45"
          >
            <Icon name="split" size={19} />
            {busy ? "Splitting…" : "Split it"}
          </button>
        </div>
      )}
    </div>
  );
}
