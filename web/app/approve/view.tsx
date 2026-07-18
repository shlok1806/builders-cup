"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import ApprovalCard, { type ApprovalCardData } from "@/components/ApprovalCard";
import { RealtimeProvider, useApprovals } from "@/components/RealtimeProvider";
import { money, pendingApproval as seed } from "@/lib/data";

// Seed fallback so the card renders even before a live approval lands (offline demo).
const fallback: ApprovalCardData = {
  itemName: seed.item,
  amountCents: Math.round(seed.price * 100),
  rule: seed.ruleText,
  category: seed.category,
  addedBy: seed.addedBy,
  ruleSource: seed.ruleSource,
};

export default function ApprovalView({ user }: { user: string }) {
  return (
    <RealtimeProvider me={user}>
      <Device />
    </RealtimeProvider>
  );
}

function Device() {
  const { latest, refresh } = useApprovals();
  const [decision, setDecision] = useState<null | "approved" | "declined">(null);

  const decide = async (d: "approved" | "declined") => {
    setDecision(d);
    if (latest) {
      try {
        await fetch(`/api/approval/${latest.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: d }),
        });
      } catch {}
      refresh();
    }
  };

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
              ? `Your ${money(seed.yourShare)} share was charged. The cart is unblocked.`
              : "Removed from the cart. Everyone will be notified."}
          </p>
        </div>
        <Link href="/" className="press mt-2 rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent">
          Back to home
        </Link>
      </div>
    );
  }

  // Live pending targeting this device wins; seed fallback keeps the screen alive.
  const a: ApprovalCardData = latest
    ? { itemName: latest.itemName, amountCents: latest.amountCents, rule: latest.rule }
    : fallback;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <span className="text-sm font-semibold tabular-nums">9:41</span>
        <span className="text-xs font-semibold">●●● ▮</span>
      </div>
      <ApprovalCard a={a} onDecide={decide} />
    </div>
  );
}
