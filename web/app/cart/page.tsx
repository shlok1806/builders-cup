"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { money } from "@/lib/data";

// F2/F4/F8 UI — itemized cart: type each item + units, the agent sources the
// cheapest vendor and fills in the price. Then split it by everyone's rules and
// read the savings. Auto-restock is one tap and always lands on the approval
// screen — it never charges here.

const cents = (c: number) => money(c / 100);
// Names match the cached offer fixtures so the sample always prices without a
// live SERPAPI_KEY. Tequila ($52) trips the alcohol exclusion + $40 threshold beats.
const SAMPLE: Row[] = [
  { name: "Tortilla Chips", qty: 2 },
  { name: "Tequila", qty: 1 },
  { name: "Coffee", qty: 1 },
  { name: "Dish Soap", qty: 1 },
];
const emptyRows = (): Row[] => [{ name: "", qty: 1 }, { name: "", qty: 1 }, { name: "", qty: 1 }];

type Row = { name: string; qty: number };
type BuiltItem = {
  id: string;
  name: string;
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
  const [rows, setRows] = useState<Row[]>(emptyRows());
  const [busy, setBusy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResp | null>(null);
  const [lines, setLines] = useState<SplitLine[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [auto, setAuto] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: "", qty: 1 }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // Match a build result / skip back to the row the user typed (by name).
  const priced = (name: string) =>
    build?.items.find((it) => it.name.toLowerCase() === name.trim().toLowerCase());
  const skippedReason = (name: string) =>
    build?.skipped.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())?.reason;

  const total = build ? build.items.reduce((s, it) => s + it.unit_price_cents * it.qty, 0) : 0;

  async function runBuild() {
    const items = rows.filter((r) => r.name.trim());
    if (!items.length) return;
    setBusy("Sourcing best deals…");
    setBuild(null); setLines(null); setSaved(null); setAuto(null);
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
    setBuild(null); setLines(null); setSaved(null);
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
        {/* itemized input */}
        <section className="a-rise rounded-[22px] border border-line bg-surface p-4" style={{ animationDelay: "40ms" }}>
          {/* column headers */}
          <div className="flex items-center gap-2 px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            <span className="flex-1">Item</span>
            <span className="w-14 text-center">Units</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-5" />
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => {
              const p = priced(row.name);
              const reason = skippedReason(row.name);
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="e.g. tortilla chips"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[14px] font-medium text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                  />
                  <input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) => setRow(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    className="w-14 rounded-xl border border-line bg-surface-2 px-2 py-2.5 text-center text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-accent"
                  />
                  <span className="w-20 text-right font-display text-[14px] font-bold tabular-nums text-ink">
                    {p ? cents(p.unit_price_cents * p.qty) : reason ? <span className="text-[11px] font-medium text-ink-faint">no offer</span> : <span className="text-ink-faint">—</span>}
                  </span>
                  <button onClick={() => removeRow(i)} aria-label="Remove item" className="press grid h-5 w-5 place-items-center rounded-full text-ink-faint hover:text-ink">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* per-row deal subtext after build */}
          {build && (
            <div className="mt-2 space-y-0.5 px-1">
              {rows.filter((r) => r.name.trim() && priced(r.name)).map((r, i) => {
                const p = priced(r.name)!;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-positive">{p.vendor}</span>
                    {p.offersCount > 1 && <span>cheapest of {p.offersCount}</span>}
                    <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5">{p.category}</span>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={addRow} className="press mt-3 flex items-center gap-1.5 rounded-full px-1 text-[13px] font-semibold text-accent-ink">
            <Icon name="plus" size={14} /> Add item
          </button>

          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <button onClick={() => { setRows(SAMPLE.map((r) => ({ ...r }))); setBuild(null); setLines(null); setSaved(null); }} className="press rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink-soft">
              Sample cart
            </button>
            {build && <span className="text-[12px] font-medium text-ink-faint">total {cents(total)}</span>}
            <button onClick={runBuild} disabled={!!busy || !rows.some((r) => r.name.trim())} className="press ml-auto rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent disabled:opacity-40">
              Build
            </button>
          </div>
        </section>

        {busy && <p className="px-1 text-[13px] font-medium text-ink-soft">{busy}</p>}
        {auto && (
          <div className="a-rise flex items-center gap-2 rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">
            <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Due this week</span>
            <Link href="/approve?user=sam" className="text-accent-ink">{auto}</Link>
          </div>
        )}

        {build && (
          <>
            <p className="px-1 text-[12px] font-medium text-ink-faint">compared {build.dealsCompared} offers across vendors</p>
            <button onClick={runSplitAndSummary} disabled={!!busy || build.items.length === 0} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
              Split by everyone&apos;s rules
            </button>
          </>
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
