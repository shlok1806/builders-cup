"use client";

import { Avatar, Icon } from "@/components/ui";
import { fmtCents, people } from "@/lib/data";
import type { SplitLineView } from "@/lib/split-run";

const catBg: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};

// userId → display. Known seeded users get initials/color; unknown UUIDs degrade
// gracefully (no names in the split payload).
const who = (id: string) => {
  const p = people.find((x) => x.id === id);
  return p ?? { name: id.slice(0, 6), initials: id.slice(0, 2).toUpperCase(), color: "accent" };
};

// Per-line split with annotations: excluded members (present elsewhere, absent
// here) + the approval flag.
export default function SplitView({ lines }: { lines: SplitLineView[] }) {
  const roster = [...new Set(lines.flatMap((l) => l.splits.map((s) => s.userId)))];

  return (
    <div className="space-y-3">
      {lines.map((l) => {
        const present = new Set(l.splits.map((s) => s.userId));
        const excluded = roster.filter((id) => !present.has(id));
        return (
          <section key={l.itemId} className={`rounded-[20px] border bg-surface px-4 py-3.5 ${l.flag ? "border-warn/60" : "border-line"}`}>
            <div className="flex items-center gap-3">
              <span className={`h-8 w-8 shrink-0 rounded-[10px] ${catBg[l.category] ?? "bg-accent"}`} />
              <div className="text-[14.5px] font-semibold text-ink">{l.name}</div>
              <div className="ml-auto font-display text-[15px] font-bold tracking-tight text-ink tabular-nums">{fmtCents(l.lineTotalCents)}</div>
            </div>

            {/* per-user amounts */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {l.splits.map((s) => {
                const u = who(s.userId);
                return (
                  <div key={s.userId} className="flex items-center gap-1.5">
                    <Avatar initials={u.initials} color={u.color} size={22} />
                    <span className="text-[12.5px] font-semibold text-ink-soft tabular-nums">{fmtCents(s.amountCents)}</span>
                  </div>
                );
              })}
            </div>

            {/* annotations */}
            {excluded.length > 0 && (
              <p className="mt-2.5 text-[12px] font-medium text-ink-faint">
                <span className="capitalize">{l.category}</span> excluded for {excluded.map((id) => who(id).name).join(", ")}
              </p>
            )}
            {l.flag && (
              <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[12px] font-semibold text-warn">
                <Icon name="lock" size={14} strokeWidth={2.2} />
                Flagged: {l.flag.rule} → {who(l.flag.approverId).name}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
