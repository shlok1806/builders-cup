"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

// Settings ▸ Trusted stores. The household's allowlist of retailers the agent may
// source from — control + safety. Toggling a store PUTs the full allowed set; when
// every default store is on (and no custom extras), we persist null so the backend
// stays on DEFAULT_ALLOWLIST. Custom stores add reputable retailers we didn't seed.
export default function TrustedStores() {
  const [defaults, setDefaults] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/allowlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const defs: string[] = j.defaults ?? [];
        const allowed: string[] | null = j.allowed ?? null;
        setDefaults(defs);
        setEnabled(allowed === null ? new Set(defs) : new Set(allowed));
        setCustom((allowed ?? []).filter((v) => !defs.includes(v)));
      })
      .catch(() => setErr("Couldn't load stores."))
      .finally(() => setLoaded(true));
  }, []);

  const persist = async (next: Set<string>, customList: string[]) => {
    setErr("");
    const arr = [...next];
    // All defaults on + no custom extras → null (keep backend on its default set).
    const isAllDefaults =
      customList.length === 0 && arr.length === defaults.length && defaults.every((d) => next.has(d));
    try {
      const r = await fetch("/api/allowlist", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendors: isAllDefaults ? null : arr }),
      });
      if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Couldn't save. Has the migration been applied?");
    } catch {
      setErr("Couldn't reach the server.");
    }
  };

  const toggle = (store: string) => {
    const next = new Set(enabled);
    if (next.has(store)) next.delete(store);
    else next.add(store);
    setEnabled(next);
    persist(next, custom);
  };

  const addCustom = () => {
    const v = input.trim();
    setInput("");
    if (!v || defaults.includes(v) || custom.includes(v)) return;
    const nextCustom = [...custom, v];
    const next = new Set(enabled).add(v);
    setCustom(nextCustom);
    setEnabled(next);
    persist(next, nextCustom);
  };

  const removeCustom = (store: string) => {
    const nextCustom = custom.filter((c) => c !== store);
    const next = new Set(enabled);
    next.delete(store);
    setCustom(nextCustom);
    setEnabled(next);
    persist(next, nextCustom);
  };

  const chip = (store: string, isCustom: boolean) => {
    const on = enabled.has(store);
    return (
      <button
        key={store}
        onClick={() => (isCustom && !on ? removeCustom(store) : toggle(store))}
        className={`press flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
          on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-ink-faint"
        }`}
      >
        {on && <Icon name="check" size={12} strokeWidth={2.6} />}
        {store}
        {isCustom && <span onClick={(e) => { e.stopPropagation(); removeCustom(store); }} className="ml-0.5 opacity-70"><Icon name="x" size={12} strokeWidth={2.4} /></span>}
      </button>
    );
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-base font-bold text-ink">Trusted stores</h2>
        <p className="mt-0.5 text-[12.5px] font-medium text-ink-faint">
          The agent only sources from stores you allow. Tap to turn one off.
        </p>
      </div>

      {!loaded ? (
        <p className="text-[13px] font-medium text-ink-faint">Loading stores…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {defaults.map((s) => chip(s, false))}
            {custom.map((s) => chip(s, true))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              placeholder="Add a store…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
            />
            <button onClick={addCustom} disabled={!input.trim()} className="press flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-[13px] font-semibold text-on-accent disabled:opacity-45">
              <Icon name="plus" size={15} strokeWidth={2.4} /> Add
            </button>
          </div>
          {err && <p className="text-[12px] font-medium text-red-500">{err}</p>}
        </>
      )}
    </section>
  );
}
