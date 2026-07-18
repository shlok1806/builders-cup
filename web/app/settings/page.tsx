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
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState<string | null>(null);
  const [carts, setCarts] = useState<{ id: string; name: string; decision: "always" | "ask" | "never" }[]>([]);
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

  useEffect(() => {
    if (!me) return;
    fetch(`/api/recurring?user=${encodeURIComponent(me)}`)
      .then((r) => (r.ok ? r.json() : { carts: [] }))
      .then((j) => setCarts(j.carts ?? []))
      .catch(() => {});
  }, [me]);

  const setDecision = async (id: string, decision: "always" | "ask" | "never") => {
    setCarts((cs) => cs.map((c) => (c.id === id ? { ...c, decision } : c)));
    await fetch(`/api/recurring/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approverId: me, decision }),
    }).catch(() => {});
  };

  const reorder = async (id: string) => {
    setReorderBusy(id);
    setErr("");
    try {
      const r = await fetch(`/api/recurring/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: me }),
      });
      if (r.ok) { window.location.assign("/cart"); return; }
      setErr("Couldn't reorder that cart.");
    } catch { setErr("Couldn't reach the server."); } finally { setReorderBusy(null); }
  };

  const remove = async (id: string) => {
    if (!me) return;
    setPolicies((ps) => ps.filter((p) => p.id !== id)); // optimistic
    const r = await fetch(`/api/policy/${id}?user=${encodeURIComponent(me)}`, { method: "DELETE" }).catch(() => null);
    if (!r || !r.ok) await load(); // restore on failure
  };

  const startEdit = (p: Policy) => { setEditingId(p.id); setText(p.source_text); setErr(""); };
  const cancelEdit = () => { setEditingId(null); setText(""); setErr(""); };

  // Save a new rule, or replace the one being edited (compile new → drop old).
  const save = async () => {
    const t = text.trim();
    if (!t || !me) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/policy/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: me, text: t }),
      });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "Couldn't save that rule."); return; }
      if (editingId) await fetch(`/api/policy/${editingId}?user=${encodeURIComponent(me)}`, { method: "DELETE" }).catch(() => {});
      setText(""); setEditingId(null); await load();
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <Link href="/group" aria-label="Back to group" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="back" size={18} />
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
            <div key={p.id} className="flex items-start gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink">{describe(p)}</div>
                <div className="mt-0.5 text-[12px] font-medium text-ink-faint">&ldquo;{p.source_text}&rdquo;</div>
              </div>
              <button onClick={() => startEdit(p)} className={`press mt-0.5 shrink-0 text-[12.5px] font-semibold ${editingId === p.id ? "text-accent" : "text-accent-ink"}`}>
                Edit
              </button>
              <button onClick={() => remove(p.id)} aria-label="Delete rule" className="press -mr-1 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:text-warn">
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-ink">Recurring carts</h2>
          {carts.length === 0 && <p className="text-sm text-ink-soft">No recurring carts yet.</p>}
          {carts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-surface p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-ink">{c.name}</span>
                <button onClick={() => reorder(c.id)} disabled={reorderBusy === c.id} className="press text-[13px] font-semibold text-accent disabled:opacity-50">{reorderBusy === c.id ? "Reordering…" : "Reorder"}</button>
              </div>
              <div className="flex gap-2">
                {(["always", "ask", "never"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDecision(c.id, opt)}
                    className={`press flex-1 rounded-xl border py-2 text-[13px] font-semibold capitalize ${
                      c.decision === opt ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-[20px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-ink">{editingId ? "Edit rule" : "New rule"}</label>
            {editingId && <button onClick={cancelEdit} className="press text-[12px] font-semibold text-ink-faint">Cancel</button>}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. don't split alcohol to me"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={save}
            disabled={busy || !text.trim()}
            className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-45"
          >
            <Icon name={editingId ? "check" : "plus"} size={18} strokeWidth={2.4} />
            {busy ? "Compiling…" : editingId ? "Update rule" : "Add rule"}
          </button>
          {err && <p className="mt-2 text-[12px] font-medium text-red-500">{err}</p>}
        </section>
      </main>
    </div>
  );
}
