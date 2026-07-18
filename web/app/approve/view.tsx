"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock, Icon } from "@/components/ui";
import ApprovalCard, { type ApprovalCardData } from "@/components/ApprovalCard";
import { RealtimeProvider, useApprovals } from "@/components/RealtimeProvider";

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
  const [standing, setStanding] = useState<'always' | 'ask' | 'never'>('ask');
  const [error, setError] = useState<string | null>(null);

  const decide = async (d: "approved" | "declined") => {
    if (!latest) return;
    setError(null);
    try {
      const response = await fetch(`/api/approval/${latest.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: d }),
      });
      const body = await response.json() as {
        error?: string;
        awaitingOtherApprovals?: boolean;
        completed?: true;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not save your decision");

      if (latest.recurringCartId && standing !== 'ask') {
        await fetch(`/api/recurring/${latest.recurringCartId}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ approverId: latest.approverId, decision: standing }),
        });
      }

      if (body.awaitingOtherApprovals) {
        await refresh();
        return;
      }

      if (d === "approved" && !body.completed) {
        throw new Error("Purchase could not be recorded");
      }

      setDecision(d);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your decision");
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
              ? "The purchase is recorded in History and counts toward the household budget."
              : "Removed from the cart. Everyone will be notified."}
          </p>
        </div>
        <Link href="/" className="press mt-2 rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent">
          Back to home
        </Link>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col items-center justify-center bg-bg px-8 text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">No approvals waiting</h1>
        <p className="mt-2 text-[15px] font-medium text-ink-soft">New requests will appear here automatically.</p>
        <Link href="/" className="press mt-6 rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent">Back to home</Link>
      </div>
    );
  }

  const a: ApprovalCardData = {
    itemName: latest.itemName,
    amountCents: latest.amountCents,
    rule: latest.rule,
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <Clock className="text-sm font-semibold tabular-nums" />
      </div>
      {latest?.recurringCartId && (
        <div className="px-6 pb-1 text-[13px] font-medium text-ink-soft">
          <p className="mb-1.5">For <span className="font-semibold text-ink">{latest.recurringCartName}</span> next time:</p>
          <div className="flex gap-2">
            {(['always', 'ask', 'never'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setStanding(opt)}
                className={`press flex-1 rounded-xl border py-2 text-[13px] font-semibold capitalize ${
                  standing === opt ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="px-6 pb-2 text-center text-[13px] font-medium text-warn">{error}</p>}
      <ApprovalCard a={a} onDecide={decide} />
    </div>
  );
}
