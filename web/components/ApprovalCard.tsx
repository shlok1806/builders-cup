"use client";

import Link from "next/link";
import { Icon } from "@/components/ui";
import { fmtCents } from "@/lib/data";

export type ApprovalCardData = {
  itemName: string;
  amountCents: number;
  rule: string;
  category?: string;
  addedBy?: string;
  ruleSource?: string;
};

// Phone-sized approval card: "Approve $52 tequila?" with Approve/Decline.
// Driven by a live pending approval (or a seed fallback so it demos offline).
export default function ApprovalCard({ a, onDecide }: { a: ApprovalCardData; onDecide: (d: "approved" | "declined") => void }) {
  return (
    <div className="a-sheet flex flex-1 flex-col gap-[18px] px-[22px] pt-3.5 pb-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-[9px] w-[9px] rounded-full bg-warn" />
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-warn">Approval needed</span>
        </div>
        <Link href="/" aria-label="Close" className="press grid h-[34px] w-[34px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="x" size={15} strokeWidth={2} />
        </Link>
      </div>

      <h1 className="font-display text-[27px] font-bold leading-tight tracking-tight text-ink">Approve this split?</h1>

      <div className="flex items-center gap-3.5 rounded-[20px] border border-line bg-surface px-4 py-4">
        <span className="grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-alcohol text-white">
          <Icon name="wine" size={24} />
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-ink">{a.itemName}</div>
          <div className="text-[12px] font-medium capitalize text-ink-faint">
            {a.category ?? "flagged"}{a.addedBy ? ` · added by ${a.addedBy}` : ""}
          </div>
        </div>
        <div className="ml-auto font-display text-[19px] font-bold tracking-tight text-ink tabular-nums">{fmtCents(a.amountCents)}</div>
      </div>

      <div className="flex gap-3 rounded-2xl bg-accent-soft px-[15px] py-3.5">
        <span className="mt-0.5 text-accent-ink"><Icon name="lock" size={20} /></span>
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Your rule</div>
          <p className="mt-1 text-[13.5px] font-semibold capitalize leading-snug text-ink">{a.rule}</p>
          {a.ruleSource && <p className="mt-1 text-[11.5px] text-ink-faint">compiled from &ldquo;{a.ruleSource}&rdquo;</p>}
        </div>
      </div>

      <div className="mt-auto space-y-2.5 pt-2">
        <button
          onClick={() => onDecide("approved")}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent"
        >
          <Icon name="check" size={19} strokeWidth={2.4} />
          Approve · {fmtCents(a.amountCents)}
        </button>
        <button
          onClick={() => onDecide("declined")}
          className="press w-full rounded-2xl border-[1.5px] border-line bg-surface py-4 text-[15px] font-semibold text-ink-soft"
        >
          Not this time
        </button>
      </div>
    </div>
  );
}
