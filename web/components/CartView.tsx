"use client";

import { Icon } from "@/components/ui";
import { fmtCents, type CartResult } from "@/lib/data";

const catBg: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};

// The built cart: line items + a "skipped (reason)" list.
export default function CartView({ cart }: { cart: CartResult }) {
  const total = cart.items.reduce((s, it) => s + it.unit_price_cents * it.qty, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-line bg-surface px-4">
        {cart.items.map((it, i) => (
          <div key={it.id} className={`flex items-center gap-3 py-[13px] ${i < cart.items.length - 1 ? "border-b border-line" : ""}`}>
            <span className={`h-9 w-9 shrink-0 rounded-[11px] ${catBg[it.category] ?? "bg-accent"}`} />
            <div className="leading-tight">
              <div className="text-[14.5px] font-semibold text-ink">{it.name}</div>
              <div className="text-[11.5px] font-medium capitalize text-ink-faint">
                {it.category}{it.qty > 1 ? ` · ×${it.qty}` : ""}
              </div>
            </div>
            <div className="ml-auto font-display text-[15px] font-bold tracking-tight text-ink tabular-nums">
              {fmtCents(it.unit_price_cents * it.qty)}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line py-3">
          <span className="text-[13px] font-semibold text-ink-soft">Subtotal</span>
          <span className="font-display text-[17px] font-bold tracking-tight text-ink tabular-nums">{fmtCents(total)}</span>
        </div>
      </section>

      {cart.skipped.length > 0 && (
        <section className="rounded-2xl bg-surface-2 px-4 py-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            <Icon name="x" size={13} strokeWidth={2.4} /> Skipped
          </div>
          {cart.skipped.map((s) => (
            <div key={s.name} className="text-[13px] font-medium text-ink-soft">
              <span className="capitalize text-ink">{s.name}</span> — {s.reason}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
