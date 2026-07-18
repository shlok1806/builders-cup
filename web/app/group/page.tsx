"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, CheckBadge, CountUp, Icon, ThemeToggle } from "@/components/ui";
import UserSwitcher from "@/components/UserSwitcher";
import { useMe } from "@/lib/useMe";
import { categories, household, money, people, totals } from "@/lib/data";

// Literal class names so Tailwind generates them.
const catBg: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Dash = {
  thisMonthCents: number;
  byCategory: { category: string; cents: number }[];
  byUser: { userId: string; name: string; cents: number }[];
  budgetCents: number;
  overBudget: boolean;
  owedCents: number;
  chargedUsers: number;
  totalUsers: number;
};

export default function GroupDashboard() {
  const { me, byId } = useMe();
  const [dash, setDash] = useState<Dash | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  // Live numbers from /api/dashboard; keep the mock as the offline fallback so
  // the landing screen never renders empty.
  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then(setDash)
      .catch(() => {});
  }, []);

  // Live approval-bell badge for the current user. Won't match the hardcoded
  // mock once someone flags an item mid-demo, so read it from the same source
  // the approval device polls.
  useEffect(() => {
    if (!me) return;
    fetch(`/api/approvals?user=${encodeURIComponent(me)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => setPending(d.pending?.length ?? 0))
      .catch(() => {});
  }, [me]);

  const spent = dash ? dash.thisMonthCents / 100 : totals.spent;
  const budget = dash ? dash.budgetCents / 100 : totals.budget;
  const left = budget - spent;
  const usedPct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const overBudget = dash?.overBudget ?? false;

  const cats = dash
    ? dash.byCategory.map((c) => ({
        name: cap(c.category),
        color: c.category,
        pct: dash.thisMonthCents ? Math.round((c.cents / dash.thisMonthCents) * 100) : 0,
      }))
    : categories;

  const persons = dash
    ? [...dash.byUser]
        .sort((a, b) => b.cents - a.cents)
        .map((u) => {
          const info = byId[u.userId];
          return {
            id: u.userId,
            name: u.name || info?.name || u.userId.slice(0, 6),
            initials: info?.initials ?? (u.name ? u.name.slice(0, 2).toUpperCase() : "??"),
            color: info?.color ?? "accent",
            amount: u.cents / 100,
          };
        })
    : people.map((p) => ({ id: p.id, name: p.name, initials: p.initials, color: p.color, amount: p.share }));

  const badge = pending ?? totals.needApproval;
  const owed = dash ? dash.owedCents / 100 : totals.owed;
  const allSquare = owed <= 0;
  const charged = dash ? dash.chargedUsers : persons.length;
  const chargedOf = dash ? dash.totalUsers : persons.length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      {/* status bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <span className="font-sans text-sm font-semibold tabular-nums">9:41</span>
        <span className="text-xs font-semibold tracking-tight">●●● ▮</span>
      </div>

      {/* header */}
      <header className="flex items-center justify-between px-5 pt-2 pb-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Back to groups">
          <span className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="home" size={18} />
          </span>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold tracking-tight text-ink">{household.name}</div>
            <div className="text-[12.5px] font-medium text-ink-faint">{household.roommates} roommates</div>
          </div>
        </Link>
        <div className="flex items-center gap-2.5">
          <UserSwitcher />
          <ThemeToggle />
          <Link href={`/approve?user=${encodeURIComponent(me)}`} className="press relative grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="bell" size={20} />
            {badge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-bg bg-warn px-1 text-[10px] font-semibold text-white">
                {badge}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-1">
        {/* primary card */}
        <section className="a-rise rounded-[26px] border border-line bg-surface p-[22px]" style={{ animationDelay: "40ms" }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Spent this month</span>
            <span className="text-[12.5px] font-semibold text-ink-soft">July ▾</span>
          </div>
          <CountUp target={spent} className="mt-1 block font-display text-[42px] font-bold leading-none tracking-tight text-ink tabular-nums" />

          <div className="mt-[18px]">
            <div className="flex items-center justify-between text-[12.5px] font-semibold">
              <span className="text-ink-soft">Monthly budget</span>
              <span className={overBudget ? "text-warn" : "text-accent-ink"}>
                {overBudget ? `${money(spent - budget)} over` : `${money(left)} left`}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
              <div className={`a-grow h-full rounded-full ${overBudget ? "bg-warn" : "bg-accent"}`} style={{ width: `${usedPct}%`, animationDelay: "200ms" }} />
            </div>
            <div className="mt-1.5 text-[11.5px] font-medium text-ink-faint">
              {usedPct}% of {money(budget)} used
            </div>
          </div>

          {/* all-square panel */}
          <div className="mt-[18px] flex items-center justify-between rounded-2xl bg-positive-soft px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <CheckBadge size={22} delay={500} />
              <div className="leading-tight">
                <div className="text-[13.5px] font-semibold text-ink">{allSquare ? "You're all square" : "Settling up"}</div>
                <div className="text-[11.5px] font-medium text-ink-soft">{money(owed)} owed · {charged} of {chargedOf} charged</div>
              </div>
            </div>
            <div className="flex">
              {persons.map((p, i) => (
                <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -9 }}>
                  <Avatar initials={p.initials[0]} color={p.color} size={26} ring="var(--positive-soft)" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* each person */}
        <section className="a-rise space-y-2.5" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Each person&apos;s share</h2>
            <span className="text-[13px] font-semibold text-accent-ink">See all ›</span>
          </div>
          <div className="rounded-[22px] border border-line bg-surface px-4">
            {persons.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 py-[13px] ${i < persons.length - 1 ? "border-b border-line" : ""}`}>
                <Avatar initials={p.initials} color={p.color} size={40} />
                <div className="text-sm font-semibold text-ink">{p.name}</div>
                <div className="ml-auto text-right">
                  <div className="font-display text-[15px] font-bold tracking-tight text-ink tabular-nums">{money(p.amount)}</div>
                  <div className="text-[11px] font-semibold text-positive">this month</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* where it went */}
        <section className="a-rise rounded-[22px] border border-line bg-surface px-5 py-[18px]" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Where it went</h2>
            <span className="text-[12.5px] font-medium text-ink-faint">{cats.length} categories</span>
          </div>
          <div className="mt-4 flex h-4 gap-[3px]">
            {cats.map((c, i) => (
              <div key={c.name} className={`a-grow rounded-[5px] ${catBg[c.color] ?? "bg-accent"}`} style={{ width: `${c.pct}%`, animationDelay: `${260 + i * 60}ms` }} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2.5">
            {cats.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5">
                <span className={`h-[9px] w-[9px] rounded-full ${catBg[c.color] ?? "bg-accent"}`} />
                <span className="text-[12.5px] font-semibold text-ink">{c.name}</span>
                <span className="text-[12px] font-medium text-ink-faint tabular-nums">{c.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-1/2 z-10 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-8 pt-3 pb-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="home" size={24} />
            <span className="text-[11px] font-semibold">Groups</span>
          </Link>
          <Link href="/cart" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="cart" size={24} />
            <span className="text-[11px] font-semibold">Cart</span>
          </Link>
          <Link href="/cart" className="press -mt-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-2px_rgba(109,90,230,0.5)]">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </Link>
          <Tab icon="split" label="Split" />
          <Link href="/settings" className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon name="rules" size={24} />
            <span className="text-[11px] font-semibold">Rules</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

function Tab({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button className={`flex flex-col items-center gap-1.5 ${active ? "text-accent" : "text-ink-faint"}`}>
      <Icon name={icon} size={24} />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}
