"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, CartTab, Icon } from "@/components/ui";
import { useMe } from "@/lib/useMe";
import { money } from "@/lib/data";

// Ramp-style analytics: one hero gauge (spend vs budget) + a 270° gauge per
// category (share of spend, in that category's hue) + per-person spend. All from
// /api/dashboard — no new backend. Category hues reuse the app's fixed palette
// (--cat-*), assigned by entity, never cycled (dataviz: categorical rule).

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cents = (c: number) => money(c / 100);

type Dash = {
  thisMonthCents: number;
  byCategory: { category: string; cents: number }[];
  byUser: { userId: string; name: string; cents: number }[];
  budgetCents: number;
  overBudget: boolean;
};

// --- SVG 270° gauge (speedometer, open at the bottom) ---
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function pt(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180; // 0deg = top, clockwise
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
// Arc from startDeg sweeping `span` degrees clockwise (deg measured clockwise from top).
function arc(c: number, r: number, startDeg: number, span: number): string {
  const [x1, y1] = pt(c, r, startDeg);
  const [x2, y2] = pt(c, r, startDeg + span);
  const large = span > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
const START = 225; // bottom-left; 270° sweep leaves a 90° gap at the bottom

function Gauge({
  pct, color, size = 116, stroke = 11, children, label,
}: {
  pct: number; color: string; size?: number; stroke?: number; children: React.ReactNode; label: string;
}) {
  const c = size / 2;
  const r = c - stroke;
  const p = clamp(pct);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-0">
        <path d={arc(c, r, START, 270)} fill="none" stroke="var(--line)" strokeWidth={stroke} strokeLinecap="round" />
        {p > 0 && (
          <path d={arc(c, r, START, 270 * p)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">{children}</div>
    </div>
  );
}

export default function Analytics() {
  const { byId } = useMe();
  const [dash, setDash] = useState<Dash | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then(setDash)
      .catch(() => {});
  }, []);

  const total = dash?.thisMonthCents ?? 0;
  const budget = dash?.budgetCents ?? 0;
  const over = dash?.overBudget ?? false;
  const cats = [...(dash?.byCategory ?? [])].sort((a, b) => b.cents - a.cents);
  const people = [...(dash?.byUser ?? [])].sort((a, b) => b.cents - a.cents);
  const peopleMax = Math.max(1, ...people.map((p) => p.cents));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-2.5 px-5 pt-6 pb-3">
        <Link href="/group" aria-label="Back to group" className="press grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="back" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">Analytics</h1>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {!dash && <p className="px-1 text-[13px] font-medium text-ink-soft">Loading…</p>}

        {/* hero: spend vs budget */}
        {dash && (
          <section className="a-rise grid place-items-center rounded-[26px] border border-line bg-surface p-6" style={{ animationDelay: "40ms" }}>
            <Gauge pct={budget ? total / budget : 0} color={over ? "var(--warn)" : "var(--accent)"} size={192} stroke={16}
              label={`Spent ${cents(total)} of ${cents(budget)} budget`}>
              <div>
                <div className="font-display text-[34px] font-bold tabular-nums text-ink">{cents(total)}</div>
                <div className="mt-1 text-[12px] font-semibold text-ink-soft">of {cents(budget)}</div>
              </div>
            </Gauge>
            <div className={`mt-2 rounded-full px-3 py-1 text-[12px] font-semibold ${over ? "bg-warn-soft text-warn" : "bg-positive-soft text-positive"}`}>
              {over ? `${cents(total - budget)} over budget` : `${cents(budget - total)} left this month`}
            </div>
          </section>
        )}

        {/* category gauges */}
        {dash && cats.length > 0 && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "80ms" }}>
            <h2 className="px-1 font-display text-base font-bold tracking-tight text-ink">By category</h2>
            <div className="grid grid-cols-2 gap-3">
              {cats.map((c) => {
                const pct = total ? c.cents / total : 0;
                return (
                  <div key={c.category} className="grid place-items-center rounded-[22px] border border-line bg-surface p-4">
                    <Gauge pct={pct} color={`var(--cat-${c.category})`}
                      label={`${cap(c.category)}: ${cents(c.cents)}, ${Math.round(pct * 100)}% of spend`}>
                      <div>
                        <div className="font-display text-[17px] font-bold tabular-nums text-ink">{cents(c.cents)}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-ink-faint tabular-nums">{Math.round(pct * 100)}%</div>
                      </div>
                    </Gauge>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-[9px] w-[9px] rounded-full" style={{ background: `var(--cat-${c.category})` }} />
                      <span className="text-[12.5px] font-semibold text-ink">{cap(c.category)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* per-person spend */}
        {dash && people.length > 0 && (
          <section className="a-rise space-y-2.5" style={{ animationDelay: "120ms" }}>
            <h2 className="px-1 font-display text-base font-bold tracking-tight text-ink">By person</h2>
            <div className="rounded-[22px] border border-line bg-surface px-4 py-1.5">
              {people.map((u, i) => {
                const info = byId[u.userId];
                return (
                  <div key={u.userId} className={`flex items-center gap-3 py-3 ${i < people.length - 1 ? "border-b border-line" : ""}`}>
                    <Avatar initials={info?.initials ?? (u.name ? u.name.slice(0, 2).toUpperCase() : "??")} color={info?.color ?? "accent"} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink">{u.name || info?.name || u.userId.slice(0, 6)}</div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="a-grow h-full rounded-full bg-accent" style={{ width: `${Math.round((u.cents / peopleMax) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="font-display text-[14px] font-bold tabular-nums text-ink">{cents(u.cents)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-1/2 z-10 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-8 pt-3 pb-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="home" size={24} />
            <span className="text-[11px] font-semibold">Groups</span>
          </Link>
          <CartTab />
          <Link href="/cart" className="press -mt-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-2px_rgba(109,90,230,0.5)]">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </Link>
          <Link href="/history" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="split" size={24} />
            <span className="text-[11px] font-semibold">History</span>
          </Link>
          <Link href="/settings" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="rules" size={24} />
            <span className="text-[11px] font-semibold">Rules</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
