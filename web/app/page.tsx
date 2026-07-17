"use client";

import Link from "next/link";
import { Avatar, CheckBadge, CountUp, Icon, ThemeToggle } from "@/components/ui";
import { categories, household, money, people, totals } from "@/lib/data";

// Literal class names so Tailwind generates them.
const catBg: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      {/* status bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <span className="font-sans text-sm font-semibold tabular-nums">9:41</span>
        <span className="text-xs font-semibold tracking-tight">●●● ▮</span>
      </div>

      {/* header */}
      <header className="flex items-center justify-between px-5 pt-2 pb-3">
        <div className="flex items-center gap-3">
          <Avatar initials="AC" color="groceries" size={42} />
          <div className="leading-tight">
            <div className="font-display text-lg font-bold tracking-tight text-ink">{household.name}</div>
            <div className="text-[12.5px] font-medium text-ink-faint">{household.roommates} roommates</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link href="/approve?user=sam" className="press relative grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="bell" size={20} />
            <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-bg bg-warn px-1 text-[10px] font-semibold text-white">
              {totals.needApproval}
            </span>
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
          <CountUp target={totals.spent} className="mt-1 block font-display text-[42px] font-bold leading-none tracking-tight text-ink tabular-nums" />

          <div className="mt-[18px]">
            <div className="flex items-center justify-between text-[12.5px] font-semibold">
              <span className="text-ink-soft">Monthly budget</span>
              <span className="text-accent-ink">{money(totals.left)} left</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="a-grow h-full rounded-full bg-accent" style={{ width: `${totals.usedPct}%`, animationDelay: "200ms" }} />
            </div>
            <div className="mt-1.5 text-[11.5px] font-medium text-ink-faint">
              {totals.usedPct}% of {money(totals.budget)} used
            </div>
          </div>

          {/* all-square panel */}
          <div className="mt-[18px] flex items-center justify-between rounded-2xl bg-positive-soft px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <CheckBadge size={22} delay={500} />
              <div className="leading-tight">
                <div className="text-[13.5px] font-semibold text-ink">You&apos;re all square</div>
                <div className="text-[11.5px] font-medium text-ink-soft">{money(totals.owed)} owed · 4 of 4 charged</div>
              </div>
            </div>
            <div className="flex">
              {people.map((p, i) => (
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
            {people.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 py-[13px] ${i < people.length - 1 ? "border-b border-line" : ""}`}>
                <Avatar initials={p.initials} color={p.color} size={40} />
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-ink">{p.name}</div>
                  <div className="text-[11.5px] font-medium text-ink-faint tabular-nums">•• {p.last4} · charged</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-display text-[15px] font-bold tracking-tight text-ink tabular-nums">{money(p.share)}</div>
                  <div className="text-[11px] font-semibold text-positive">settled</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* where it went */}
        <section className="a-rise rounded-[22px] border border-line bg-surface px-5 py-[18px]" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Where it went</h2>
            <span className="text-[12.5px] font-medium text-ink-faint">6 categories</span>
          </div>
          <div className="mt-4 flex h-4 gap-[3px]">
            {categories.map((c, i) => (
              <div key={c.name} className={`a-grow rounded-[5px] ${catBg[c.color]}`} style={{ width: `${c.pct}%`, animationDelay: `${260 + i * 60}ms` }} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2.5">
            {categories.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5">
                <span className={`h-[9px] w-[9px] rounded-full ${catBg[c.color]}`} />
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
          <Tab icon="home" label="Home" active />
          <Tab icon="cart" label="Cart" />
          <button className="press -mt-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-2px_rgba(109,90,230,0.5)]">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </button>
          <Tab icon="split" label="Split" />
          <Tab icon="rules" label="Rules" />
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
