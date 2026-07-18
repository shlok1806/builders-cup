"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CartTab, Icon } from "@/components/ui";
import { MemberCard, type CardData } from "@/components/MemberCard";
import { useMe } from "@/lib/useMe";

// Your card (demo): your virtual card with real last-4/brand + this-month spend,
// categorised. Server-scoped to you via /api/cards.

export default function Cards() {
  const { me } = useMe();
  const [cards, setCards] = useState<CardData[] | null>(null);

  useEffect(() => {
    // Server scopes to the signed-in user (cookie); pass ?user once known so the
    // demo user-switcher reflects immediately. You only ever get your own card.
    fetch(`/api/cards${me ? `?user=${encodeURIComponent(me)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => setCards(d.cards))
      .catch(() => setCards([]));
  }, [me]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-2.5 px-5 pt-6 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">Your card</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-28 pt-1">
        {cards == null && <p className="px-1 text-[13px] font-medium text-ink-soft">Loading…</p>}
        {cards != null && cards.length === 0 && (
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] font-medium text-ink-soft">No card spend yet this month.</p>
        )}

        {(cards ?? []).map((c, i) => (
          <section key={c.userId} className="a-rise" style={{ animationDelay: `${40 + i * 60}ms` }}>
            <MemberCard card={c} />
          </section>
        ))}
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
