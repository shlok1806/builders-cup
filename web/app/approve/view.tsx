"use client";

import { useState } from "react";
import { Clock, Icon } from "@/components/ui";
import { RealtimeProvider, useApprovals, type Pending } from "@/components/RealtimeProvider";
import { fmtCents } from "@/lib/data";

export default function ApprovalView({ user }: { user: string }) {
  return (
    <RealtimeProvider me={user}>
      <Device />
    </RealtimeProvider>
  );
}

function Device() {
  const { pending, refresh } = useApprovals();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per recurring-cart "always/ask/never" choice, keyed by recurringCartId.
  const [standing, setStanding] = useState<Record<string, "always" | "ask" | "never">>({});

  const decide = async (item: Pending, d: "approved" | "declined") => {
    setBusyId(item.id);
    setErrorId(null);
    setError(null);
    try {
      const response = await fetch(`/api/approval/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: d }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save your decision");

      const cartStanding = item.recurringCartId ? standing[item.recurringCartId] ?? "ask" : "ask";
      if (item.recurringCartId && cartStanding !== "ask") {
        await fetch(`/api/recurring/${item.recurringCartId}/decision`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ approverId: item.approverId, decision: cartStanding }),
        });
      }
      refresh();
    } catch (err) {
      setErrorId(item.id);
      setError(err instanceof Error ? err.message : "Could not save your decision");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <Clock className="text-sm font-semibold tabular-nums" />
      </div>

      <header className="px-6 pt-2 pb-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Approvals</h1>
        <p className="mt-0.5 text-[12.5px] font-medium text-ink-faint">
          {pending.length ? `${pending.length} waiting on you` : "You're all caught up"}
        </p>
      </header>

      <main className="flex-1 space-y-3 px-5 pb-10">
        {pending.length === 0 && (
          <div className="a-rise rounded-[22px] border border-dashed border-line bg-surface px-5 py-10 text-center text-[13.5px] font-medium text-ink-faint">
            No pending approvals right now.
          </div>
        )}

        {pending.map((item) => (
          <div key={item.id} className="a-rise rounded-[22px] border border-line bg-surface px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold text-ink">{item.itemName}</div>
                <div className="mt-0.5 truncate text-[12px] font-medium capitalize text-ink-faint">{item.rule}</div>
                {item.recurringCartName && (
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-ink-faint">
                    Recurring: {item.recurringCartName}
                  </div>
                )}
              </div>
              <div className="shrink-0 font-display text-[17px] font-bold tracking-tight text-ink tabular-nums">
                {fmtCents(item.amountCents)}
              </div>
            </div>

            {item.recurringCartId && (
              <div className="mt-3 flex gap-2">
                {(["always", "ask", "never"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setStanding((s) => ({ ...s, [item.recurringCartId as string]: opt }))}
                    className={`press flex-1 rounded-xl border py-1.5 text-[12px] font-semibold capitalize ${
                      (standing[item.recurringCartId as string] ?? "ask") === opt
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {errorId === item.id && error && (
              <p role="alert" className="mt-2 text-[12px] font-medium text-warn">
                {error}
              </p>
            )}

            <div className="mt-3 flex gap-2.5">
              <button
                onClick={() => decide(item, "approved")}
                disabled={busyId === item.id}
                aria-label="Approve"
                className="press grid h-11 flex-1 place-items-center rounded-2xl bg-accent text-on-accent disabled:opacity-50"
              >
                <Icon name="check" size={19} strokeWidth={2.6} />
              </button>
              <button
                onClick={() => decide(item, "declined")}
                disabled={busyId === item.id}
                aria-label="Decline"
                className="press grid h-11 flex-1 place-items-center rounded-2xl border-[1.5px] border-line bg-surface text-ink-soft disabled:opacity-50"
              >
                <Icon name="x" size={19} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
