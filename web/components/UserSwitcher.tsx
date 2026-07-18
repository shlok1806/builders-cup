"use client";

import { useState } from "react";
import { Avatar, Icon } from "@/components/ui";
import { useMe } from "@/lib/useMe";

// Dropdown over seeded users — sets "who am I" (no auth). Phone-first: big tap
// targets, tap-to-open (no hover).
export default function UserSwitcher() {
  const { me, setMe, users } = useMe();
  const [open, setOpen] = useState(false);
  const cur = users.find((u) => u.id === me) ?? users[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch user"
        className="press flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-ink-soft"
      >
        <Avatar initials={cur.initials} color={cur.color} size={32} />
        <Icon name="split" size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="a-rise absolute right-0 top-[46px] z-20 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => { setMe(u.id); setOpen(false); }}
                className={`press flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left ${u.id === me ? "bg-accent-soft" : ""}`}
              >
                <Avatar initials={u.initials} color={u.color} size={34} />
                <span className="text-[14px] font-semibold text-ink">{u.name}</span>
                {u.id === me && <span className="ml-auto text-accent-ink"><Icon name="check" size={16} strokeWidth={2.6} /></span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
