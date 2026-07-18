"use client";

import { money } from "@/lib/data";

// A member's virtual card (gradient face + optional category breakdown). Shared
// by /cards (full) and /group (compact). Accent + category dots use the fixed
// --cat-* palette by entity.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cents = (c: number) => money(c / 100);
const CATS = ["groceries", "meat", "alcohol", "household", "snacks", "cleaning"];
const col = (c: string) => (CATS.includes(c) ? `var(--cat-${c})` : "var(--accent)");

export type CardData = {
  userId: string;
  name: string;
  color: string;
  last4: string;
  brand: string;
  spentCents: number;
  byCategory: { category: string; cents: number }[];
};

export function MemberCard({ card, showBreakdown = true }: { card: CardData; showBreakdown?: boolean }) {
  const accent = col(card.color);
  const total = card.byCategory.reduce((s, b) => s + b.cents, 0);
  return (
    <div className="space-y-2.5">
      <div
        className="rounded-[22px] p-5 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 62%, #000) 100%)` }}
      >
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-90">{card.brand}</span>
          <span className="grid h-6 w-8 place-items-center rounded-[5px] bg-white/25 text-[9px] font-bold">CHIP</span>
        </div>
        <div className="mt-6 font-mono text-[15px] tracking-[0.22em] tabular-nums">•••• •••• •••• {card.last4}</div>
        <div className="mt-4 flex items-end justify-between">
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">Cardholder</div>
            <div className="text-[15px] font-semibold">{card.name}</div>
          </div>
          <div className="text-right leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">This month</div>
            <div className="font-display text-[20px] font-bold tabular-nums">{cents(card.spentCents)}</div>
          </div>
        </div>
      </div>

      {showBreakdown && total > 0 && (
        <div className="rounded-[20px] border border-line bg-surface px-4 py-3.5">
          <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full">
            {card.byCategory.map((b) => (
              <div key={b.category} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(b.cents / total) * 100}%`, background: col(b.category) }} />
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {card.byCategory.map((b) => (
              <div key={b.category} className="flex items-center gap-2 text-[12.5px]">
                <span className="h-[9px] w-[9px] rounded-full" style={{ background: col(b.category) }} />
                <span className="font-semibold text-ink">{cap(b.category)}</span>
                <span className="ml-auto font-semibold tabular-nums text-ink">{cents(b.cents)}</span>
                <span className="w-9 text-right text-[11px] font-medium tabular-nums text-ink-faint">{Math.round((b.cents / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
