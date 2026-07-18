"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import CartInput from "@/components/CartInput";
import CartView from "@/components/CartView";
import SplitView from "@/components/SplitView";
import SavingsCard from "@/components/SavingsCard";
import { mockCart, mockSplitLines, type CartResult } from "@/lib/data";
import { useMe } from "@/lib/useMe";
import type { SplitLineView } from "@/lib/split-run";

type Charge = { userId: string; amountCents: number; status: "succeeded" | "failed" };
type Summary = { savedCents: number; stepsCollapsed: number };

// F2/F4/F8 — build cart → split → (await approval) → checkout → savings.
// Wires P2/P3/P4 routes; falls back to seed data so it demos offline.
export default function CartPage() {
  const { me } = useMe();
  const [cart, setCart] = useState<CartResult | null>(null);
  const [lines, setLines] = useState<SplitLineView[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cleared, setCleared] = useState(false);
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

  const flagged = lines?.some((l) => l.flag) ?? false;
  const approvers = [...new Set((lines ?? []).flatMap((l) => (l.flag ? [l.flag.approverId] : [])))];

  // Poll approvals while a flag blocks checkout; clear once none pending for this
  // purchase (approval landed on the device). No flag → nothing to wait on.
  useEffect(() => {
    if (!cart || !lines || !flagged || cleared) return;
    let alive = true;
    const check = async () => {
      try {
        const results = await Promise.all(
          approvers.map((a) =>
            fetch(`/api/approvals?user=${encodeURIComponent(a)}`, { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : { pending: [] })),
          ),
        );
        const stillPending = results.some((j) =>
          (j.pending ?? []).some((p: { purchaseId?: string }) => p.purchaseId === cart.purchaseId),
        );
        if (alive && !stillPending) setCleared(true);
      } catch {}
    };
    check();
    const t = setInterval(check, 1500);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, lines, flagged, cleared]);

  // Offline fallback: sum split lines per user so the money-shot still lands.
  const mockCharges = (): Charge[] => {
    const totals = new Map<string, number>();
    for (const l of lines ?? []) for (const s of l.splits) totals.set(s.userId, (totals.get(s.userId) ?? 0) + s.amountCents);
    return [...totals.entries()].map(([userId, amountCents]) => ({ userId, amountCents, status: "succeeded" as const }));
  };

  const checkout = async () => {
    if (!cart) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase/${cart.purchaseId}/checkout`, { method: "POST" });
      if (r.status === 409) return; // still pending → stay in the awaiting state
      const j = r.ok ? await r.json() : { charges: mockCharges() };
      setCharges(j.charges?.length ? j.charges : mockCharges());
      try {
        const s = await fetch(`/api/purchase/${cart.purchaseId}/summary`);
        setSummary(s.ok ? await s.json() : { savedCents: 1800, stepsCollapsed: 7 });
      } catch {
        setSummary({ savedCents: 1800, stepsCollapsed: 7 });
      }
    } catch {
      setCharges(mockCharges());
      setSummary({ savedCents: 1800, stepsCollapsed: 7 });
    } finally {
      setBusy(false);
    }
  };

  const awaiting = flagged && !cleared;
  const title = !cart ? "New cart" : charges ? "All charged" : lines ? "The split" : "Your cart";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h1>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {!cart && <CartInput onBuild={build} loading={busy} />}
        {cart && !lines && <CartView cart={cart} />}
        {lines && !charges && <SplitView lines={lines} />}
        {charges && (
          <SavingsCard savedCents={summary?.savedCents ?? 0} stepsCollapsed={summary?.stepsCollapsed} charges={charges} />
        )}
      </main>

      {cart && !lines && (
        <Footer>
          <button onClick={split} disabled={busy} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent disabled:opacity-45">
            <Icon name="split" size={19} />
            {busy ? "Splitting…" : "Split it"}
          </button>
        </Footer>
      )}

      {lines && !charges && (
        <Footer>
          {awaiting && (
            <p className="mb-2.5 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-warn">
              <Icon name="lock" size={14} strokeWidth={2.2} />
              Awaiting approval…
            </p>
          )}
          <button onClick={checkout} disabled={busy || awaiting} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent disabled:opacity-45">
            <Icon name="check" size={19} strokeWidth={2.6} />
            {busy ? "Charging…" : awaiting ? "Blocked until approved" : "Check out"}
          </button>
        </Footer>
      )}

      {charges && (
        <Footer>
          <Link href="/group" className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent">
            <Icon name="check" size={19} strokeWidth={2.6} />
            Done
          </Link>
        </Footer>
      )}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 left-1/2 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-5 pt-3 pb-8">
      {children}
    </div>
  );
}
