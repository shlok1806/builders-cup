"use client";

import { Avatar, CheckBadge, CountUp, Icon } from "@/components/ui";
import { fmtCents, people } from "@/lib/data";
import { useUsers } from "@/lib/useUsers";

// F8 money-shot: shown after checkout from GET /api/purchase/[id]/summary.
// "$X saved", "N steps → 1", and one card per real charge flipping to "charged".
// Without `charges` it previews the mock roster (offline/standalone).
type Charge = { userId: string; amountCents: number; status: "succeeded" | "failed" };

export default function SavingsCard({
  savedCents,
  stepsCollapsed = 4,
  charges,
}: {
  savedCents: number;
  stepsCollapsed?: number;
  charges?: Charge[];
}) {
  const { byId } = useUsers();

  const rows = charges?.length
    ? charges.map((c) => {
        const u = byId[c.userId] ?? { name: c.userId.slice(0, 6), initials: c.userId.slice(0, 2).toUpperCase(), color: "accent" };
        return { key: c.userId, name: u.name, initials: u.initials, color: u.color, amountCents: c.amountCents, ok: c.status === "succeeded" };
      })
    : people.map((p) => ({ key: p.id, name: p.name, initials: p.initials, color: p.color, amountCents: Math.round(p.share * 100), ok: true }));
  const okCount = rows.filter((r) => r.ok).length;

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
        {rows.map((r, i) => (
          <div key={r.key} className={`a-rise flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${r.ok ? "bg-positive-soft" : "bg-surface-2"}`} style={{ animationDelay: `${300 + i * 140}ms` }}>
            <Avatar initials={r.initials} color={r.color} size={30} />
            <div className="leading-tight">
              <div className="text-[13.5px] font-semibold text-ink">{r.name}</div>
              <div className="text-[11px] font-medium text-ink-faint tabular-nums">{r.ok ? "charged" : "failed"}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-display text-[14px] font-bold tracking-tight text-ink tabular-nums">{fmtCents(r.amountCents)}</span>
              {r.ok ? (
                <CheckBadge size={20} delay={420 + i * 140} />
              ) : (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-ink-soft"><Icon name="x" size={12} strokeWidth={2.6} /></span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] font-semibold text-positive">All {okCount} charged automatically</p>
    </section>
  );
}
