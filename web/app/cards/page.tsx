"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CartTab, Icon } from "@/components/ui";
import { money } from "@/lib/data";

// Household cards (demo): one virtual card per member with their real card
// last-4/brand and this-month spend, categorised. Data from /api/cards. Card
// accent + category dots reuse the fixed --cat-* palette (assigned by entity).

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cents = (c: number) => money(c / 100);
const CATS = ["groceries", "meat", "alcohol", "household", "snacks", "cleaning"];
const col = (c: string) => (CATS.includes(c) ? `var(--cat-${c})` : "var(--accent)");

type Card = {
  userId: string;
  name: string;
  color: string;
  last4: string;
  brand: string;
  spentCents: number;
  byCategory: { category: string; cents: number }[];
};

export default function Cards() {
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => setCards(d.cards))
      .catch(() => setCards([]));
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-2.5 px-5 pt-6 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">Household cards</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-28 pt-1">
        {cards == null && <p className="px-1 text-[13px] font-medium text-ink-soft">Loading…</p>}
        {cards != null && cards.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] font-medium text-ink-soft">No cards yet.</p>
        )}

        {(cards ?? []).map((c, i) => {
          const accent = col(c.color);
          const total = c.byCategory.reduce((s, b) => s + b.cents, 0);
          return (
            <section key={c.userId} className="a-rise space-y-2.5" style={{ animationDelay: `${40 + i * 60}ms` }}>
              {/* the card */}
              <div
                className="rounded-[22px] p-5 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
                style={{ background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 62%, #000) 100%)` }}
              >
                <div className="flex items-start justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">{c.brand}</span>
                  <span className="grid h-6 w-8 place-items-center rounded-[5px] bg-white/25 text-[9px] font-bold">CHIP</span>
                </div>
                <div className="mt-6 font-mono text-[15px] tracking-[0.22em] tabular-nums">•••• •••• •••• {c.last4}</div>
                <div className="mt-4 flex items-end justify-between">
                  <div className="leading-tight">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">Cardholder</div>
                    <div className="text-[15px] font-semibold">{c.name}</div>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">This month</div>
                    <div className="font-display text-[20px] font-bold tabular-nums">{cents(c.spentCents)}</div>
                  </div>
                </div>
              </div>

              {/* categorised spend */}
              {total > 0 ? (
                <div className="rounded-[20px] border border-line bg-surface px-4 py-3.5">
                  <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full">
                    {c.byCategory.map((b) => (
                      <div key={b.category} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(b.cents / total) * 100}%`, background: col(b.category) }} />
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {c.byCategory.map((b) => (
                      <div key={b.category} className="flex items-center gap-2 text-[12.5px]">
                        <span className="h-[9px] w-[9px] rounded-full" style={{ background: col(b.category) }} />
                        <span className="font-semibold text-ink">{cap(b.category)}</span>
                        <span className="ml-auto font-semibold tabular-nums text-ink">{cents(b.cents)}</span>
                        <span className="w-9 text-right text-[11px] font-medium tabular-nums text-ink-faint">{Math.round((b.cents / total) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-1 text-[12px] font-medium text-ink-faint">No spend on this card yet this month.</p>
              )}
            </section>
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
          <Link href="/history" className="flex flex-col items-center gap-1.5 text-ink-faint">
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
