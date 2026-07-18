"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, CartTab, Icon } from "@/components/ui";
import { useMe } from "@/lib/useMe";

const catBg: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const statusLabel: Record<string, string> = {
  charged: "Charged", awaiting_approval: "Awaiting approval", building: "Draft", failed: "Failed",
};
const statusCls: Record<string, string> = {
  charged: "bg-positive-soft text-positive", awaiting_approval: "bg-warn/15 text-warn",
  building: "bg-surface-2 text-ink-soft", failed: "bg-warn/15 text-warn",
};

type Purchase = {
  id: string;
  createdAt: string;
  status: string;
  subtotalCents: number;
  title: string;
  items: { name: string; qty: number; category: string; unitPriceCents: number }[];
  byUser: { userId: string; name: string; cents: number }[];
};

export default function History() {
  const { byId } = useMe();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => setPurchases(d.purchases ?? []))
      .catch(() => setPurchases([]));
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">History</h1>
      </header>

      <main className="flex-1 space-y-3 px-5 pb-28 pt-1">
        {purchases === null && (
          <p className="py-10 text-center text-[13px] font-medium text-ink-faint">Loading…</p>
        )}
        {purchases?.length === 0 && (
          <p className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center text-[13px] font-medium text-ink-faint">
            No expenses yet.
          </p>
        )}
        {purchases?.map((p) => {
          const isOpen = open === p.id;
          const date = new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <div key={p.id} className="rounded-[20px] border border-line bg-surface">
              <button
                onClick={() => setOpen(isOpen ? null : p.id)}
                className="press flex w-full items-center gap-3 px-4 py-3.5 text-left"
                aria-expanded={isOpen}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{p.title || "Cart"}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11.5px] font-medium text-ink-faint">
                    <span>{date}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusCls[p.status] ?? "bg-surface-2 text-ink-soft"}`}>
                      {statusLabel[p.status] ?? p.status}
                    </span>
                    <span>· {p.items.length} items</span>
                  </div>
                </div>
                <div className="font-display text-[15px] font-bold tabular-nums text-ink">{usd(p.subtotalCents)}</div>
                <Icon name="split" size={14} className={`text-ink-faint transition-transform ${isOpen ? "-rotate-90" : "rotate-90"}`} />
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-line px-4 py-3.5">
                  <div className="space-y-1.5">
                    {p.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-[13px]">
                        <span className={`h-[8px] w-[8px] shrink-0 rounded-full ${catBg[it.category] ?? "bg-accent"}`} />
                        <span className="truncate text-ink">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                        <span className="ml-auto font-medium tabular-nums text-ink-soft">{usd(it.unitPriceCents * it.qty)}</span>
                      </div>
                    ))}
                  </div>
                  {p.byUser.length > 0 && (
                    <div className="border-t border-line pt-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-ink">Split</div>
                      <div className="space-y-1.5">
                        {p.byUser.map((u) => {
                          const info = byId[u.userId];
                          return (
                            <div key={u.userId} className="flex items-center gap-2.5 text-[13px]">
                              <Avatar initials={info?.initials ?? (u.name.slice(0, 2).toUpperCase() || "??")} color={info?.color ?? "accent"} size={24} />
                              <span className="text-ink">{u.name || info?.name || "—"}</span>
                              <span className="ml-auto font-semibold tabular-nums text-ink">{usd(u.cents)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-1/2 z-10 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-8 pt-3 pb-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="home" size={24} />
            <span className="text-[11px] font-semibold">Groups</span>
          </Link>
          <CartTab />
          <Link href="/cart" className="press -mt-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-2px_rgba(109,90,230,0.5)]">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </Link>
          <Link href="/history" className="flex flex-col items-center gap-1.5 text-accent">
            <Icon name="split" size={24} />
            <span className="text-[11px] font-semibold">History</span>
          </Link>
          <Link href="/settings" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="rules" size={24} />
            <span className="text-[11px] font-semibold">Rules</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
