"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { money, pendingApproval as a } from "@/lib/data";

export default function ApprovalView({ user }: { user: string }) {
  const [decision, setDecision] = useState<null | "approved" | "declined">(null);

  if (decision) {
    const approved = decision === "approved";
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-5 bg-bg px-8 text-center">
        <div className="a-pop">
          {approved ? (
            <span className="grid h-20 w-20 place-items-center rounded-full bg-positive text-white">
              <Icon name="check" size={40} strokeWidth={3} />
            </span>
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-full bg-surface-2 text-ink-soft">
              <Icon name="x" size={40} strokeWidth={2.6} />
            </span>
          )}
        </div>
        <div className="a-rise">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
            {approved ? "Approved" : "Declined"}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-ink-soft">
            {approved
              ? `Your ${money(a.yourShare)} share was charged. Ava's cart is unblocked.`
              : "Removed from the cart. Ava will be notified."}
          </p>
        </div>
        <Link href="/" className="press mt-2 rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <span className="text-sm font-semibold tabular-nums">9:41</span>
        <span className="text-xs font-semibold">●●● ▮</span>
      </div>

      <div className="a-sheet flex flex-1 flex-col gap-[18px] px-[22px] pt-3.5 pb-7">
        {/* eyebrow */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-[9px] w-[9px] rounded-full bg-warn" />
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-warn">Approval needed</span>
          </div>
          <Link href="/" className="press grid h-[34px] w-[34px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="x" size={15} strokeWidth={2} />
          </Link>
        </div>

        <h1 className="font-display text-[27px] font-bold leading-tight tracking-tight text-ink">Approve this split?</h1>

        {/* item */}
        <div className="flex items-center gap-3.5 rounded-[20px] border border-line bg-surface px-4 py-4">
          <span className="grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-alcohol text-white">
            <Icon name="wine" size={24} />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-ink">{a.item}</div>
            <div className="text-[12px] font-medium text-ink-faint">{a.category} · added by {a.addedBy}</div>
          </div>
          <div className="ml-auto font-display text-[19px] font-bold tracking-tight text-ink tabular-nums">{money(a.price)}</div>
        </div>

        {/* rule callout */}
        <div className="flex gap-3 rounded-2xl bg-accent-soft px-[15px] py-3.5">
          <span className="mt-0.5 text-accent-ink"><Icon name="lock" size={20} /></span>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Your rule</div>
            <p className="mt-1 text-[13.5px] font-semibold leading-snug text-ink">{a.ruleText}</p>
            <p className="mt-1 text-[11.5px] text-ink-faint">compiled from &ldquo;{a.ruleSource}&rdquo;</p>
          </div>
        </div>

        <p className="text-[13px] font-medium leading-relaxed text-ink-soft">
          If you approve, your share is {money(a.yourShare)} — split evenly 4 ways.
        </p>

        <div className="mt-auto space-y-2.5 pt-2">
          <button
            onClick={() => setDecision("approved")}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent"
          >
            <Icon name="check" size={19} strokeWidth={2.4} />
            Approve · {money(a.price)}
          </button>
          <button
            onClick={() => setDecision("declined")}
            className="press w-full rounded-2xl border-[1.5px] border-line bg-surface py-4 text-[15px] font-semibold text-ink-soft"
          >
            Not this time
          </button>
          <p className="pt-0.5 text-center text-[12px] font-medium text-ink-faint">
            {a.addedBy}&apos;s cart is on hold until you decide.
          </p>
        </div>
      </div>
    </div>
  );
}
