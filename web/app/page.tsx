"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, CartTab, Clock, Icon, ThemeToggle } from "@/components/ui";
import UserSwitcher from "@/components/UserSwitcher";
import { useMe } from "@/lib/useMe";
import { household, money } from "@/lib/data";

type Dash = {
  thisMonthCents: number;
  byUser: { userId: string; name: string; cents: number }[];
};

// Landing: the shared groups you belong to. One card per group -> tap to enter
// its dashboard (/group). "+ New group" is decorative (demo only).
export default function Groups() {
  const { me, users } = useMe();
  const [dash, setDash] = useState<Dash | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then(setDash)
      .catch(() => {});
  }, []);

  // Start at 0 while /api/dashboard is loading rather than flashing a mock
  // number that doesn't match the real total once it resolves.
  const total = dash ? dash.thisMonthCents / 100 : 0;
  const liveShare = dash?.byUser.find((u) => u.userId === me)?.cents;
  const myShare = liveShare != null ? liveShare / 100 : 0;
  const members = users.length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      {/* status bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 text-ink">
        <Clock className="font-sans text-sm font-semibold tabular-nums" />
      </div>

      {/* header */}
      <header className="flex items-center justify-between px-5 pt-2 pb-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Your groups</h1>
        <div className="flex items-center gap-2.5">
          <UserSwitcher />
          <ThemeToggle />
          <Link href="/account" aria-label="Settings" className="press grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
            <Icon name="cog" size={20} />
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-10 pt-2">
        <Link
          href="/group"
          className="a-rise block rounded-[26px] border border-line bg-surface p-[22px]"
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex items-center gap-3">
            <Avatar initials="AC" color="groceries" size={46} />
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight text-ink">{household.name}</div>
              <div className="text-[12.5px] font-medium text-ink-faint">{members} members</div>
            </div>
            <Icon name="split" size={18} className="ml-auto -rotate-90 text-ink-faint" />
          </div>

          <div className="mt-4 flex items-end justify-between">
            <div className="leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">This month</div>
              <div className="mt-0.5 font-display text-[26px] font-bold tracking-tight text-ink tabular-nums">{money(total)}</div>
            </div>
            <div className="rounded-2xl bg-positive-soft px-3.5 py-2 text-right leading-tight">
              <div className="text-[11px] font-semibold text-ink-soft">Your share</div>
              <div className="font-display text-[15px] font-bold text-ink tabular-nums">{money(myShare)}</div>
            </div>
          </div>
        </Link>

        <button
          onClick={() => setMsg("Creating new groups is disabled in this demo.")}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface py-3.5 text-[14px] font-semibold text-ink-soft"
        >
          <Icon name="plus" size={18} strokeWidth={2.4} />
          New group
        </button>
        {msg && <p className="text-center text-[12px] font-medium text-ink-faint">{msg}</p>}
      </main>

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-1/2 z-10 w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-surface px-8 pt-3 pb-8">
        <div className="flex items-center justify-between">
          <Tab icon="home" label="Home" active />
          <CartTab />
          <Link href="/cart" className="press -mt-1 grid h-[54px] w-[54px] place-items-center rounded-full bg-accent text-on-accent shadow-[0_6px_16px_-2px_rgba(109,90,230,0.5)]">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </Link>
          <Tab icon="split" label="Split" />
          <Tab icon="rules" label="Rules" />
        </div>
      </nav>
    </div>
  );
}

// Bottom-bar tab. Presentational in this demo — Home is the active landing;
// Split/Rules are inert placeholders (matches the decorative "New group").
function Tab({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`flex flex-col items-center gap-1.5 ${active ? "text-accent" : "text-ink-faint"}`}
    >
      <Icon name={icon} size={24} />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}
