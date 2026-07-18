"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import { money } from "@/lib/data";
import { clearCart, setCart, useCart } from "@/lib/useCart";

// The "+" flow: describe what the house needs, the agent sources the cheapest
// vendor per line and appends the result to the running cart (one Supabase
// purchase). Splitting + paying happen on /checkout. Auto-restock still drafts
// straight to the approval screen.

const cents = (c: number) => money(c / 100);
const EXAMPLES = [
  "restock + snacks for Friday",
  "we're low on coffee and dish soap",
  "snacks and drinks for game night",
];

type BuiltItem = {
  id: string;
  name: string;
  productName: string;
  qty: number;
  category: string;
  unit_price_cents: number;
  vendor: string;
  url: string | null;
  offersCount: number;
  runnerUpCents: number | null;
  reason: string | null;
};
type BuildResp = {
  purchaseId: string;
  items: BuiltItem[];
  cartCount: number;
  cartSubtotalCents: number;
  skipped: { name: string; reason: string }[];
  dealsCompared: number;
  overBudget: boolean;
};

export default function CartPage() {
  const { cartId, count } = useCart();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResp | null>(null);
  const [auto, setAuto] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const total = build?.items?.reduce((s, it) => s + it.unit_price_cents * it.qty, 0) ?? 0;

  async function runBuild(prompt: string, opts?: { retryWithoutCart?: boolean }) {
    const q = prompt.trim();
    if (!q) return;
    setText(q);
    setBusy("Sourcing the cheapest cart…");
    setBuild(null); setAuto(null); setBuildError(null);
    setBuild(null); setAuto(null); setErr(null);
    const r = await fetch("/api/cart/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: q,
        cartId: opts?.retryWithoutCart ? undefined : cartId ?? undefined,
      }),
    });
    const j = await r.json();
    // Stale local cart id (paid / awaiting approval) — drop it and open a fresh cart.
    if (r.status === 409 && !opts?.retryWithoutCart) {
      clearCart();
      return runBuild(q, { retryWithoutCart: true });
    }
    if (!r.ok || !Array.isArray(j.items)) {
      setBusy(null);
      setErr(j.error ? `Couldn’t build: ${j.error}` : "Couldn’t build that cart — try again");
      return;
    }
    setBuild(j as BuildResp);
    if (j.purchaseId) setCart(j.purchaseId, j.cartCount);
    setText("");
    setBusy(null);
  }

  async function runAuto() {
    setBusy("Agent checking what's running low…");
    setBuild(null); setText(""); setErr(null);
    const r = await fetch("/api/auto-restock", { method: "POST" });
    const j = await r.json();
    setAuto(j.purchaseId ? `Drafted ${j.lineCount} items ($${(j.subtotalCents / 100).toFixed(2)}) — awaiting approval` : "Nothing due this week");
    setBusy(null);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center justify-between px-5 pt-6 pb-3">
        <div className="flex items-center gap-2.5">
          <Link href="/group" aria-label="Back to group" className="press grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="back" size={18} />
          </Link>
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">Add to cart</h1>
        </div>
        <button onClick={runAuto} className="press rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-accent-ink">
          Auto-restock ▸
        </button>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {/* running-cart banner */}
        {count > 0 && (
          <Link href="/checkout" className="a-rise flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3" style={{ animationDelay: "20ms" }}>
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Icon name="cart" size={16} className="text-accent-ink" />
              {count} item{count === 1 ? "" : "s"} in your cart
            </span>
            <span className="text-[13px] font-semibold text-accent-ink">Checkout ›</span>
          </Link>
        )}

        {/* prompt */}
        <section className="a-rise rounded-[24px] border border-line bg-surface p-4" style={{ animationDelay: "40ms" }}>
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-soft">
            <Icon name="cart" size={14} className="text-accent-ink" />
            Tell the agent what to add
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runBuild(text); }}
            placeholder="e.g. restock the apartment and grab snacks for Friday"
            rows={3}
            className="w-full resize-none bg-transparent px-1 text-[16px] font-medium leading-snug text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => runBuild(ex)} disabled={!!busy} className="press rounded-full bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-soft disabled:opacity-40">
                {ex}
              </button>
            ))}
          </div>
          <button onClick={() => runBuild(text)} disabled={!!busy || !text.trim()} className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
            {busy && <Spinner size={15} />}
            {busy ? "Working…" : "Build cart"}
          </button>
        </section>

        {busy && (
          <p className="a-rise flex items-center gap-2 px-1 text-[13px] font-medium text-ink-soft">
            <Spinner size={15} className="text-accent-ink" /> {busy}
          </p>
        )}
        {buildError && (
          <p role="alert" className="a-rise px-1 text-[13px] font-medium text-warn">{buildError}</p>
        )}
        {auto && (
          <div className="a-rise flex items-center gap-2 rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">
            <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Due this week</span>
            <Link href="/approve?user=sam" className="text-accent-ink">{auto}</Link>
          </div>
        )}
        {err && (
          <div className="a-rise rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">
            {err}
          </div>
        )}

        {/* what this build just added */}
        {build && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-base font-bold tracking-tight text-ink">
                {build.items.length > 0 ? `Added ${build.items.length} item${build.items.length === 1 ? "" : "s"}` : "Nothing added"}
              </h2>
              <span className="text-[12px] font-medium text-ink-faint">compared {build.dealsCompared} offers</span>
            </div>

            {build.overBudget && (
              <div className="rounded-2xl border border-line bg-warn-soft px-4 py-2.5 text-[12.5px] font-semibold text-ink">
                Trimmed to stay within the monthly budget.
              </div>
            )}

            {build.items.length > 0 ? (
              <div className="overflow-hidden rounded-[22px] border border-line bg-surface">
                {build.items.map((it, i) => (
                  <div key={it.id} className={`flex items-start gap-3 px-4 py-3 ${i < build.items.length - 1 ? "border-b border-line" : ""}`}>
                    <div className="min-w-0 flex-1 leading-tight">
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noopener noreferrer" className="press flex items-center gap-1 text-sm font-semibold text-ink hover:text-accent-ink">
                          <span className="truncate">{it.productName}</span>
                          <Icon name="external" size={12} strokeWidth={2.2} className="shrink-0 text-ink-faint" />
                        </a>
                      ) : (
                        <div className="truncate text-sm font-semibold text-ink">{it.productName}</div>
                      )}
                      {it.productName.toLowerCase() !== it.name.toLowerCase() && (
                        <div className="mt-0.5 truncate text-[11px] font-medium capitalize text-ink-faint">for {it.name}</div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-ink-faint">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-soft">Qty {it.qty}</span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-positive">{it.vendor}</span>
                        {it.offersCount > 1 && <span>cheapest of {it.offersCount}</span>}
                        {it.reason && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-accent-ink">{it.reason}</span>}
                      </div>
                    </div>
                    <div className="text-right leading-tight">
                      <div className="font-display text-[15px] font-bold tabular-nums text-ink">{cents(it.unit_price_cents * it.qty)}</div>
                      {it.runnerUpCents != null && it.runnerUpCents > it.unit_price_cents && (
                        <div className="text-[11px] font-medium text-ink-faint line-through tabular-nums">{cents(it.runnerUpCents * it.qty)}</div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-surface-2 px-4 py-2.5">
                  <span className="text-[12.5px] font-semibold text-ink-soft">Added this build</span>
                  <span className="font-display text-[15px] font-bold tabular-nums text-ink">{cents(total)}</span>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] font-medium text-ink-soft">
                Couldn&apos;t source any of those — try naming items more generically.
              </p>
            )}

            {build.skipped.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3">
                {build.skipped.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
                    <Icon name="x" size={13} /> Skipped {s.name} — {s.reason}
                  </div>
                ))}
              </div>
            )}

            {build.cartCount > 0 && (
              <Link href="/checkout" className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent">
                Go to cart · {build.cartCount} item{build.cartCount === 1 ? "" : "s"} ({cents(build.cartSubtotalCents)})
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
