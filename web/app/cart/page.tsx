"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import { money } from "@/lib/data";

// F2/F4/F8 UI — describe what the house needs in plain language; the agent parses
// it, folds in what's running low, sources the cheapest vendor per line, and
// composes the cart. Then split by everyone's rules and read the savings.
// Auto-restock is one tap and always lands on the approval screen.

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
  skipped: { name: string; reason: string }[];
  dealsCompared: number;
  overBudget: boolean;
};
type SplitLine = {
  itemId: string;
  name: string;
  category: string;
  lineTotalCents: number;
  splits: { userId: string; amountCents: number }[];
  flag?: { approverId: string; rule: string };
};

export default function CartPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResp | null>(null);
  const [lines, setLines] = useState<SplitLine[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [auto, setAuto] = useState<string | null>(null);

  const reset = () => { setBuild(null); setLines(null); setSaved(null); };
  const total = build ? build.items.reduce((s, it) => s + it.unit_price_cents * it.qty, 0) : 0;

  async function runBuild(prompt: string) {
    const q = prompt.trim();
    if (!q) return;
    setText(q);
    setBusy("Sourcing the cheapest cart…");
    reset(); setAuto(null);
    const r = await fetch("/api/cart/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: q }),
    });
    setBuild(await r.json());
    setBusy(null);
  }

  async function runSplitAndSummary() {
    if (!build) return;
    setBusy("Splitting by everyone's rules…");
    const s = await fetch(`/api/purchase/${build.purchaseId}/split`, { method: "POST" });
    setLines((await s.json()).lines);
    const sum = await fetch(`/api/purchase/${build.purchaseId}/summary`);
    setSaved((await sum.json()).savedCents);
    setBusy(null);
  }

  async function runAuto() {
    setBusy("Agent checking what's running low…");
    reset(); setText("");
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
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">Build a cart</h1>
        </div>
        <button onClick={runAuto} className="press rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-accent-ink">
          Auto-restock ▸
        </button>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {/* prompt */}
        <section className="a-rise rounded-[24px] border border-line bg-surface p-4" style={{ animationDelay: "40ms" }}>
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-soft">
            <Icon name="cart" size={14} className="text-accent-ink" />
            Tell the agent what the house needs
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
        {auto && (
          <div className="a-rise flex items-center gap-2 rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">
            <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Due this week</span>
            <Link href="/approve?user=sam" className="text-accent-ink">{auto}</Link>
          </div>
        )}

        {/* composed cart */}
        {build && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-base font-bold tracking-tight text-ink">Cart</h2>
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
                  <span className="text-[12.5px] font-semibold text-ink-soft">Subtotal</span>
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

            {build.items.length > 0 && (
              <button onClick={runSplitAndSummary} disabled={!!busy} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
                Split by everyone&apos;s rules
              </button>
            )}
          </section>
        )}

        {/* split view */}
        {lines && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "40ms" }}>
            <h2 className="px-1 font-display text-base font-bold tracking-tight text-ink">Split</h2>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.itemId} className="rounded-2xl border border-line bg-surface px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{l.name}</span>
                    <span className="font-display text-[14px] font-bold tabular-nums text-ink">{cents(l.lineTotalCents)}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] font-medium text-ink-faint">
                    {l.splits.length} paying · {cents(Math.round(l.lineTotalCents / Math.max(1, l.splits.length)))} avg
                  </div>
                  {l.flag && (
                    <div className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-ink">
                      ⚑ Flagged — {l.flag.rule}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* savings */}
        {saved != null && (
          <section className="a-rise rounded-[22px] border border-line bg-positive-soft p-5 text-center" style={{ animationDelay: "80ms" }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-positive">Agent saved you</div>
            <div className="mt-1 font-display text-[36px] font-bold leading-none tabular-nums text-ink">{cents(saved)}</div>
            <div className="mt-1.5 text-[12.5px] font-medium text-ink-soft">by sourcing the cheapest vendor on every line</div>
          </section>
        )}
      </main>
    </div>
  );
}
