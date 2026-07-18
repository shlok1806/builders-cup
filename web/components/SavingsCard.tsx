"use client";

import { Avatar, CheckBadge, CountUp } from "@/components/ui";
import { fmtCents, people } from "@/lib/data";

// F8 money-shot: shown after checkout from GET /api/purchase/[id]/summary.
// "$X saved", "N steps → 1", and the four charge cards flipping to "charged".
export default function SavingsCard({
  savedCents,
  stepsCollapsed = 4,
}: {
  savedCents: number;
  stepsCollapsed?: number;
}) {
  return (
    <section className="a-sheet rounded-[26px] border border-line bg-surface p-[22px]">
      <div className="text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">You saved</span>
        <CountUp
          target={savedCents / 100}
          className="mt-1 block font-display text-[46px] font-bold leading-none tracking-tight text-positive tabular-nums"
        />
        <p className="mt-2 text-[13.5px] font-medium text-ink-soft">
          {stepsCollapsed} steps → <span className="font-semibold text-ink">1 tap</span>
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {people.map((p, i) => (
          <div key={p.id} className="a-rise flex items-center gap-3 rounded-2xl bg-positive-soft px-3.5 py-2.5" style={{ animationDelay: `${300 + i * 140}ms` }}>
            <Avatar initials={p.initials} color={p.color} size={30} />
            <div className="leading-tight">
              <div className="text-[13.5px] font-semibold text-ink">{p.name}</div>
              <div className="text-[11px] font-medium text-ink-faint tabular-nums">•• {p.last4}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-display text-[14px] font-bold tracking-tight text-ink tabular-nums">{fmtCents(Math.round(p.share * 100))}</span>
              <CheckBadge size={20} delay={420 + i * 140} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] font-semibold text-positive">All 4 charged automatically</p>
    </section>
  );
}
