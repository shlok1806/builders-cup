"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { money } from "@/lib/data";

// F2/F4/F8 UI — drives the whole scraper pipeline: build a cart from free text,
// see each line sourced to the cheapest vendor ("cheapest of N"), split it, and
// read the savings. The autonomous weekly restock is one tap and always lands on
// the approval screen — it never charges here.

const DEMO_PROMPT = "restock + snacks for Friday";
const cents = (c: number) => money(c / 100);

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
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildResp | null>(null);
  const [lines, setLines] = useState<SplitLine[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [auto, setAuto] = useState<string | null>(null);

  async function runBuild(prompt: string) {
    setBusy("Sourcing best deals…");
    setBuild(null); setLines(null); setSaved(null); setAuto(null);
    const r = await fetch("/api/cart/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: prompt }),
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
        {/* input */}
        <section className="a-rise rounded-[22px] border border-line bg-surface p-4" style={{ animationDelay: "40ms" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. restock the apartment and snacks for Friday"
            rows={2}
            className="w-full resize-none bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => { setText(DEMO_PROMPT); runBuild(DEMO_PROMPT); }} className="press rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink-soft">
              “{DEMO_PROMPT}”
            </button>
            <button onClick={() => runBuild(text)} disabled={!text || !!busy} className="press ml-auto rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent disabled:opacity-40">
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

        {/* built cart */}
        {build && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-base font-bold tracking-tight text-ink">Cart</h2>
              <span className="text-[12px] font-medium text-ink-faint">compared {build.dealsCompared} offers</span>
            </div>
            <div className="rounded-[22px] border border-line bg-surface px-4">
              {build.items.map((it, i) => (
                <div key={it.id} className={`flex items-center gap-3 py-[13px] ${i < build.items.length - 1 ? "border-b border-line" : ""}`}>
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-semibold text-ink">{it.qty}× {it.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-faint">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-positive">{it.vendor}</span>
                      {it.offersCount > 1 && <span>cheapest of {it.offersCount}</span>}
                    </div>
                  </div>
                  <div className="ml-auto text-right leading-tight">
                    <div className="font-display text-[15px] font-bold tabular-nums text-ink">{cents(it.unit_price_cents)}</div>
                    {it.runnerUpCents != null && it.runnerUpCents > it.unit_price_cents && (
                      <div className="text-[11px] font-medium text-ink-faint line-through tabular-nums">{cents(it.runnerUpCents)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {build.skipped.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3">
                {build.skipped.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
                    <Icon name="x" size={13} /> Skipped {s.name} — {s.reason}
                  </div>
                ))}
              </div>
            )}
            <button onClick={runSplitAndSummary} disabled={!!busy} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
              Split by everyone&apos;s rules
            </button>
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
