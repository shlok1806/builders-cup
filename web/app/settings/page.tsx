"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import UserSwitcher from "@/components/UserSwitcher";
import { useMe } from "@/lib/useMe";

// F3 UI — a user's rules. List their compiled policies; type a plain-English rule
// → POST /api/policy/compile → append. Re-running a split then reflects it (I2).
type Policy = { id: string; type: string; params: Record<string, unknown>; source_text: string };

const num = (v: unknown) => Number(v);
const describe = (p: Policy): string => {
  switch (p.type) {
    case "exclude_category": return `Excludes ${p.params.category}`;
    case "approval_threshold": return `Approval required over $${(num(p.params.amount_cents) / 100).toFixed(0)}`;
    case "split_weight": return `${num(p.params.weight)}× share`;
    default: return p.source_text;
  }
};

export default function Settings() {
  const { me, users } = useMe();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const meName = users.find((u) => u.id === me)?.name ?? "you";

  const load = async () => {
    if (!me) return;
    try {
      const r = await fetch(`/api/policies?user=${encodeURIComponent(me)}`, { cache: "no-store" });
      if (r.ok) setPolicies((await r.json()).policies ?? []);
    } catch {}
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [me]);

  const add = async () => {
    const t = text.trim();
    if (!t || !me) return;
    setBusy(true);
    try {
      const r = await fetch("/api/policy/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: me, text: t }),
      });
      if (r.ok) { setText(""); await load(); }
    } catch {} finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="home" size={18} />
          </Link>
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">Rules for {meName}</h1>
        </div>
        <UserSwitcher />
      </header>

      <main className="flex-1 space-y-4 px-5 pb-10 pt-1">
        <section className="space-y-2.5">
          {policies.length === 0 && (
            <p className="rounded-[18px] border border-dashed border-line px-4 py-6 text-center text-[13px] font-medium text-ink-faint">
              No rules yet. Add one below.
            </p>
          )}
          {policies.map((p) => (
            <div key={p.id} className="rounded-[18px] border border-line bg-surface px-4 py-3.5">
              <div className="text-[14px] font-semibold text-ink">{describe(p)}</div>
              <div className="mt-0.5 text-[12px] font-medium text-ink-faint">&ldquo;{p.source_text}&rdquo;</div>
            </div>
          ))}
        </section>

        <section className="rounded-[20px] border border-line bg-surface p-4">
          <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-ink">New rule</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. don't split alcohol to me"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={add}
            disabled={busy || !text.trim()}
            className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-45"
          >
            <Icon name="plus" size={18} strokeWidth={2.4} />
            {busy ? "Compiling…" : "Add rule"}
          </button>
        </section>
      </main>
    </div>
  );
}
