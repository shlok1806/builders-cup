"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { money } from "@/lib/data";
import { useMe } from "@/lib/useMe";
import { clearCart, setCart, useCart } from "@/lib/useCart";

// The main cart: the running purchase's lines. Review + remove, then split by
// everyone's rules and pay each share. Splitting reuses /split (which writes any
// pending approvals) and paying reuses /checkout; on all-charged we empty the cart.

const cents = (c: number) => money(c / 100);

type Item = { id: string; name: string; productName: string; url: string | null; qty: number; unit_price_cents: number; category: string };
// Identical items (same sourced product + price) collapse into one row shown as
// "×N"; we keep the underlying line ids so removing the row deletes them all.
type Group = { key: string; ids: string[]; name: string; productName: string; url: string | null; category: string; qty: number; unit_price_cents: number };

function groupItems(items: Item[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.productName}|${it.unit_price_cents}`;
    const g = map.get(key);
    if (g) {
      g.qty += it.qty;
      g.ids.push(it.id);
    } else {
      map.set(key, { key, ids: [it.id], name: it.name, productName: it.productName, url: it.url, category: it.category, qty: it.qty, unit_price_cents: it.unit_price_cents });
    }
  }
  return [...map.values()];
}
type SplitLine = {
  itemId: string;
  name: string;
  lineTotalCents: number;
  splits: { userId: string; amountCents: number }[];
  flag?: { approverId: string; rule: string };
};

export default function CheckoutPage() {
  const { cartId } = useCart();
  const { byId } = useMe();
  const [items, setItems] = useState<Item[] | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [lines, setLines] = useState<SplitLine[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/cart/${id}`);
    const j = await r.json();
    const list: Item[] = j.items ?? [];
    setItems(list);
    setSubtotal(j.subtotalCents ?? 0);
    // Reconcile the badge with the server truth.
    if (list.length === 0) clearCart();
    else setCart(id, list.length);
  }, []);

  useEffect(() => {
    if (cartId) load(cartId);
  }, [cartId, load]);

  async function removeGroup(ids: string[]) {
    if (!cartId) return;
    // Remove every underlying line for the collapsed row; the last response has
    // the reconciled cart.
    let j: { items?: Item[]; subtotalCents?: number } = {};
    for (const id of ids) {
      const r = await fetch(`/api/cart/${cartId}?item=${id}`, { method: "DELETE" });
      j = await r.json();
    }
    const list: Item[] = j.items ?? [];
    setItems(list);
    setSubtotal(j.subtotalCents ?? 0);
    setLines(null); setSaved(null); setCompleted(false);
    if (list.length === 0) clearCart();
    else setCart(cartId, list.length);
  }

  async function runSplit() {
    if (!cartId) return;
    setBusy("Splitting by everyone's rules…"); setErr(null);
    const s = await fetch(`/api/purchase/${cartId}/split`, { method: "POST" });
    const sj = await s.json();
    if (!s.ok) { setErr(sj.error ?? "Split failed"); setBusy(null); return; }
    setLines(sj.lines);
    const sum = await fetch(`/api/purchase/${cartId}/summary`);
    setSaved((await sum.json()).savedCents);
    setBusy(null);
  }

  async function pay() {
    if (!cartId) return;
    setBusy("Recording this purchase…"); setErr(null);
    const r = await fetch(`/api/purchase/${cartId}/checkout`, { method: "POST" });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) { setErr(j.error ?? "Could not record purchase"); return; }
    if (j.completed) {
      setCompleted(true);
      clearCart();
    }
  }

  const name = (id: string) => byId[id]?.name ?? id.slice(0, 6);
  const groups = items ? groupItems(items) : [];
  const totalQty = items ? items.reduce((s, it) => s + it.qty, 0) : 0;
  // cartId===null means no running cart at all → empty. Otherwise wait for the fetch.
  const empty = cartId === null || (items != null && items.length === 0);
  const loading = cartId !== null && items == null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-2.5 px-5 pt-6 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">Your cart</h1>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {loading && <p className="px-1 text-[13px] font-medium text-ink-soft">Loading…</p>}

        {completed && (
          <section className="a-rise rounded-[22px] border border-line bg-positive-soft p-6 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-positive">Recorded</div>
            <div className="mt-1 font-display text-[22px] font-bold text-ink">This shared purchase is complete</div>
            <p className="mt-2 text-[12.5px] font-medium text-ink-soft">It is now in History and counts toward the household budget.</p>
            <Link href="/group" className="press mt-4 inline-block rounded-2xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent">Back to group</Link>
          </section>
        )}

        {empty && !completed && (
          <section className="a-rise rounded-[22px] border border-line bg-surface p-8 text-center">
            <Icon name="cart" size={28} className="mx-auto text-ink-faint" />
            <div className="mt-3 text-sm font-semibold text-ink">Your cart is empty</div>
            <div className="mt-1 text-[12.5px] font-medium text-ink-soft">Add items with the agent, then split them here.</div>
            <Link href="/cart" className="press mt-4 inline-block rounded-2xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent">Add to cart</Link>
          </section>
        )}

        {err && <p className="a-rise rounded-2xl border border-line bg-warn-soft px-4 py-3 text-[13px] font-semibold text-ink">{err}</p>}

        {items != null && items.length > 0 && !completed && (
          <>
            <section className="a-rise space-y-2.5" style={{ animationDelay: "40ms" }}>
              <div className="overflow-hidden rounded-[22px] border border-line bg-surface">
                {groups.map((g, i) => (
                  <div key={g.key} className={`flex items-center gap-3 px-4 py-3 ${i < groups.length - 1 ? "border-b border-line" : ""}`}>
                    <div className="min-w-0 flex-1 leading-tight">
                      {g.url ? (
                        <a href={g.url} target="_blank" rel="noopener noreferrer" className="press flex items-center gap-1 text-sm font-semibold text-ink hover:text-accent-ink">
                          <span className="truncate">{g.qty > 1 ? `${g.qty}× ` : ""}{g.productName}</span>
                          <Icon name="external" size={12} strokeWidth={2.2} className="shrink-0 text-ink-faint" />
                        </a>
                      ) : (
                        <div className="truncate text-sm font-semibold text-ink">{g.qty > 1 ? `${g.qty}× ` : ""}{g.productName}</div>
                      )}
                      {g.productName.toLowerCase() !== g.name.toLowerCase() && (
                        <div className="mt-0.5 truncate text-[11px] font-medium capitalize text-ink-faint">for {g.name}</div>
                      )}
                      <div className="mt-0.5 text-[11px] font-medium text-ink-faint">{g.category}</div>
                    </div>
                    <div className="font-display text-[15px] font-bold tabular-nums text-ink">{cents(g.unit_price_cents * g.qty)}</div>
                    <button onClick={() => removeGroup(g.ids)} aria-label={`Remove ${g.productName}`} className="press grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:text-warn">
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-surface-2 px-4 py-2.5">
                  <span className="text-[12.5px] font-semibold text-ink-soft">Subtotal · {totalQty} item{totalQty === 1 ? "" : "s"}</span>
                  <span className="font-display text-[15px] font-bold tabular-nums text-ink">{cents(subtotal)}</span>
                </div>
              </div>

              {!lines && (
                <button onClick={runSplit} disabled={!!busy} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
                  {busy ?? "Split by everyone's rules"}
                </button>
              )}
            </section>

            {lines && (
              <section className="a-rise space-y-2.5" style={{ animationDelay: "40ms" }}>
                <h2 className="px-1 font-display text-base font-bold tracking-tight text-ink">Split</h2>
                <div className="space-y-2">
                  {lines.map((l) => (
                    <div key={l.itemId} className="rounded-2xl border border-line bg-surface px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">{l.name}</span>
                        <span className="font-display text-[14px] font-bold tabular-nums text-ink">{cents(l.lineTotalCents)}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] font-medium text-ink-faint">
                        {l.splits.map((s) => `${name(s.userId)} ${cents(s.amountCents)}`).join(" · ")}
                      </div>
                      {l.flag && (
                        <div className="mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-ink">
                          ⚑ Flagged — {l.flag.rule}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {saved != null && saved > 0 && (
                  <div className="rounded-[22px] border border-line bg-positive-soft p-5 text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-positive">Agent saved you</div>
                    <div className="mt-1 font-display text-[34px] font-bold leading-none tabular-nums text-ink">{cents(saved)}</div>
                    <div className="mt-1.5 text-[12.5px] font-medium text-ink-soft">by sourcing the cheapest vendor on every line</div>
                  </div>
                )}

                <button onClick={pay} disabled={!!busy} className="press w-full rounded-2xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40">
                  {busy ?? `Record this purchase · ${cents(subtotal)}`}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
