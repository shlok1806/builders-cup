"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock, Icon } from "@/components/ui";
import ApprovalCard, { type ApprovalCardData } from "@/components/ApprovalCard";
import { RealtimeProvider, useApprovals } from "@/components/RealtimeProvider";
import { money } from "@/lib/data";

export default function ApprovalView({ user }: { user: string }) {
  return (
    <RealtimeProvider me={user}>
      <Device />
    </RealtimeProvider>
  );
}

type PaymentFailure = { purchaseId: string; approverId: string; message: string };

function Device() {
  const { latest, refresh } = useApprovals();
  const [decision, setDecision] = useState<null | "approved" | "declined">(null);
  const [standing, setStanding] = useState<'always' | 'ask' | 'never'>('ask');
  const [chargedCents, setChargedCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentFailure, setPaymentFailure] = useState<PaymentFailure | null>(null);

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
        charges?: { userId: string; amountCents: number; status: "succeeded" | "failed"; failureMessage?: string }[];
      };
      if (!response.ok) throw new Error(body.error ?? "Could not save your decision");

      const failedCharge = body.charges?.find((charge) => charge.status === "failed");
      if (d === "approved" && failedCharge) {
        setPaymentFailure({
          purchaseId: latest.purchaseId ?? "",
          approverId: latest.approverId ?? "",
          message: failedCharge.failureMessage ?? "Stripe could not complete the payment",
        });
        refresh();
        return;
      }
      setPaymentFailure(null);
      setChargedCents(
        d === "approved"
          ? body.charges?.find((charge) => charge.userId === latest.approverId && charge.status === "succeeded")?.amountCents ?? null
          : null,
      );
      setDecision(d);
      if (latest.recurringCartId && standing !== 'ask') {
        await fetch(`/api/recurring/${latest.recurringCartId}/decision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ approverId: latest.approverId, decision: standing }),
        });
      }
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your decision");
    }
  };
  const retryPayment = async () => {
    if (!paymentFailure?.purchaseId) return;
    setError(null);
    try {
      const response = await fetch(`/api/purchase/${paymentFailure.purchaseId}/checkout`, { method: "POST" });
      const body = await response.json() as {
        error?: string;
        charges?: { userId: string; amountCents: number; status: "succeeded" | "failed"; failureMessage?: string }[];
      };
      if (!response.ok) throw new Error(body.error ?? "Could not retry payment");
      const failedCharge = body.charges?.find((charge) => charge.status === "failed");
      if (failedCharge) {
        setPaymentFailure((failure) => failure && { ...failure, message: failedCharge.failureMessage ?? "Stripe could not complete the payment" });
        return;
      }
      setChargedCents(body.charges?.find((charge) => charge.userId === paymentFailure.approverId)?.amountCents ?? null);
      setPaymentFailure(null);
      setDecision("approved");
      refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not retry payment");
    }
  };

  if (paymentFailure) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-5 bg-bg px-8 text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Payment needs attention</h1>
        <p className="text-[15px] font-medium text-ink-soft">{paymentFailure.message}</p>
        {error && <p role="alert" className="text-[13px] font-medium text-warn">{error}</p>}
        <button onClick={retryPayment} className="press rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent">Try payment again</button>
        <Link href="/" className="text-[14px] font-semibold text-ink-soft">Back to home</Link>
      </div>
    );
  }

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
              ? chargedCents !== null
                ? `Your ${money(chargedCents / 100)} share was charged. The purchase is in history.`
                : "Your approval was recorded. Waiting for the other approvers."
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
