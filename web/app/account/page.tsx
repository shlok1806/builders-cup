"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon, ThemeToggle } from "@/components/ui";
import { useMe } from "@/lib/useMe";

// Demo settings screen. Most rows are decorative (tap -> "demo only"); Rules
// links to the real rules screen and Log out actually logs out.
export default function Account() {
  const { me, byId } = useMe();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const cur = byId[me];
  const demo = () => setMsg("This setting is disabled in the demo.");

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-bg">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href="/" className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-soft">
          <Icon name="home" size={18} />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-tight text-ink">Settings</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-10 pt-1">
        {/* profile */}
        <button onClick={demo} className="press flex w-full items-center gap-3.5 rounded-[22px] border border-line bg-surface p-4 text-left">
          <Avatar initials={cur?.initials ?? "??"} color={cur?.color ?? "accent"} size={52} />
          <div className="leading-tight">
            <div className="font-display text-[17px] font-bold tracking-tight text-ink">{cur?.name ?? "You"}</div>
            <div className="text-[12.5px] font-medium text-ink-faint">{(cur?.name ?? "you").toLowerCase()}@cartel.app</div>
          </div>
          <span className="ml-auto text-[13px] font-semibold text-accent-ink">Edit</span>
        </button>

        <Group title="Account">
          <Row icon="card" label="Payment method" value="Visa •••• 4242" onClick={demo} />
          <Row icon="bell" label="Notifications" value="On" onClick={demo} />
          <AppearanceRow />
        </Group>

        <Group title="Household">
          <Row icon="rules" label="Rules" value="Edit" href="/settings" />
          <Row icon="split" label="Members" value="4" onClick={demo} />
          <Row icon="lock" label="Privacy & security" onClick={demo} />
        </Group>

        <Group title="About">
          <Row icon="check" label="Version" value="1.0.0 (demo)" onClick={demo} />
          <Row icon="lock" label="Terms & privacy" onClick={demo} />
        </Group>

        <button
          onClick={logout}
          className="press w-full rounded-2xl border border-line bg-surface py-3.5 text-[15px] font-semibold text-warn"
        >
          Log out
        </button>
        {msg && <p className="text-center text-[12px] font-medium text-ink-faint">{msg}</p>}
      </main>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{title}</h2>
      <div className="overflow-hidden rounded-[22px] border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({
  icon, label, value, onClick, href,
}: { icon: string; label: string; value?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-soft">
        <Icon name={icon} size={17} />
      </span>
      <span className="text-[14.5px] font-semibold text-ink">{label}</span>
      <span className="ml-auto flex items-center gap-1.5 text-[13px] font-medium text-ink-faint">
        {value}
        <Icon name="split" size={14} className="-rotate-90" />
      </span>
    </>
  );
  const cls = "flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0";
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}

function AppearanceRow() {
  return (
    <div className="flex w-full items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-soft">
        <Icon name="moon" size={17} />
      </span>
      <span className="text-[14.5px] font-semibold text-ink">Appearance</span>
      <span className="ml-auto"><ThemeToggle /></span>
    </div>
  );
}
