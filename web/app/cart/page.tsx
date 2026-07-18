"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { money } from "@/lib/data";

// F2/F4/F8 UI — itemized cart: type each item, how many, and the size/measure
// (oz, ml, pack…). The agent sources the cheapest vendor and fills in the price.
// Then split by everyone's rules and read the savings. Auto-restock is one tap
// and always lands on the approval screen — it never charges here.

const cents = (c: number) => money(c / 100);
// Names match the cached offer fixtures so the sample always prices without a
// live SERPAPI_KEY. Tequila ($52) trips the alcohol exclusion + $40 threshold beats.
const SAMPLE: Row[] = [
  { name: "Tortilla Chips", unit: "10 oz", qty: 2 },
  { name: "Tequila", unit: "750 ml", qty: 1 },
  { name: "Coffee", unit: "28 oz", qty: 1 },
  { name: "Dish Soap", unit: "", qty: 1 },
];
const blank = (): Row => ({ name: "", unit: "", qty: 1 });

type Row = { name: string; unit: string; qty: number };
type BuiltItem = {
  id: string;
  name: string;
  query: string;
  unit: string | null;
  qty: number;
  category: string;
  unit_price_cents: number;
  vendor: string;
  url: string | null;
  offersCount: number;
  runnerUpCents: number | null;
};
type BuildResp = {
  purchaseId: string;
  items: BuiltItem[];
  skipped: { name: string; reason: string }[];
  dealsCompared: number;
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
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [busy, setBusy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResp | null>(null);
  const [lines, setLines] = useState<SplitLine[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [auto, setAuto] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blank()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  const reset = () => { setBuild(null); setLines(null); setSaved(null); };

  // Match a build result / skip back to the row the user typed (by base name).
  const priced = (name: string) =>
    build?.items.find((it) => it.query.toLowerCase() === name.trim().toLowerCase());
  const skippedReason = (name: string) =>
    build?.skipped.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())?.reason;

  const total = build ? build.items.reduce((s, it) => s + it.unit_price_cents * it.qty, 0) : 0;
  const canBuild = rows.some((r) => r.name.trim());

  async function runBuild() {
    const items = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name, unit: r.unit, qty: r.qty }));
    if (!items.length) return;
    setBusy("Sourcing best deals…");
    reset(); setAuto(null);
    const r = await fetch("/api/cart/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
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
    reset();
    const r = await fetch("/api/auto-restock", { method: "POST" });
    const j = await r.json();
    setAuto(j.purchaseId ? `Drafted ${j.lineCount} items ($${(j.subtotalCents / 100).toFixed(2)}) — awaiting approval` : "Nothing due this week");
    setBusy(null);
  }

  const inputBase =
    "rounded-xl border border-line bg-surface-2 text-ink outline-none placeholder:text-ink-faint focus:border-accent";

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
        {/* itemized input — one card per item */}
        <section className="a-rise space-y-2.5" style={{ animationDelay: "40ms" }}>
          {rows.map((row, i) => {
            const p = priced(row.name);
            const reason = skippedReason(row.name);
            return (
              <div key={i} className="rounded-[18px] border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Item — e.g. tortilla chips"
                    className={`min-w-0 flex-1 bg-transparent px-1 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-faint`}
                  />
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} aria-label="Remove item" className="press grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-ink">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => setRow(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    aria-label="Quantity"
                    className={`${inputBase} w-12 px-2 py-2 text-center text-[14px] font-semibold tabular-nums`}
                  />
                  <span className="text-[13px] font-medium text-ink-faint">×</span>
                  <input
                    value={row.unit}
                    onChange={(e) => setRow(i, { unit: e.target.value })}
                    placeholder="size — oz, ml, pack…"
                    aria-label="Size or measurement"
                    className={`${inputBase} min-w-0 flex-1 px-3 py-2 text-[14px] font-medium`}
                  />
                  <span className="ml-1 w-[74px] shrink-0 text-right font-display text-[15px] font-bold tabular-nums text-ink">
                    {p ? cents(p.unit_price_cents * p.qty) : reason ? <span className="text-[11px] font-medium text-ink-faint">no offer</span> : <span className="text-ink-faint">—</span>}
                  </span>
                </div>
                {p && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5 text-[11px] font-medium text-ink-faint">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-positive">{p.vendor}</span>
                    {p.offersCount > 1 && <span>cheapest of {p.offersCount}</span>}
                    <span className="rounded bg-surface-2 px-1.5 py-0.5">{p.category}</span>
                    {p.qty > 1 && <span>· {cents(p.unit_price_cents)} each</span>}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3 px-1">
            <button onClick={addRow} className="press flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink">
              <Icon name="plus" size={14} /> Add item
            </button>
            <button onClick={() => { setRows(SAMPLE.map((r) => ({ ...r }))); reset(); }} className="press text-[13px] font-medium text-ink-faint">
              Use sample
            </button>
            {build && <span className="ml-auto text-[13px] font-semibold tabular-nums text-ink">Total {cents(total)}</span>}
          </div>

          <button onClick={runBuild} disabled={!!busy || !canBuild} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
            Build cart
          </button>
        </section>

        {busy && <p className="px-1 text-[13px] font-medium text-ink-soft">{busy}</p>}
        {auto && (
          <div className="a-rise flex items-center gap-2 rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">
            <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Due this week</span>
            <Link href="/approve?user=sam" className="text-accent-ink">{auto}</Link>
          </div>
        )}

        {build && (
          <div className="a-rise space-y-2.5" style={{ animationDelay: "40ms" }}>
            <p className="px-1 text-[12px] font-medium text-ink-faint">compared {build.dealsCompared} offers across vendors</p>
            <button onClick={runSplitAndSummary} disabled={!!busy || build.items.length === 0} className="press w-full rounded-2xl border border-accent bg-transparent py-3 text-[14px] font-semibold text-accent-ink disabled:opacity-40">
              Split by everyone&apos;s rules
            </button>
          </div>
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
