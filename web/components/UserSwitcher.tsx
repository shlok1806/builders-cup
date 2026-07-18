"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui";
import { useMe } from "@/lib/useMe";

// Header badge: shows the logged-in user; tap to log out (clears the cookie and
// returns to /login). Replaces the old no-auth user dropdown now that each phone
// logs in as its own user.
export default function UserSwitcher() {
  const { me, users } = useMe();
  const router = useRouter();
  const cur = users.find((u) => u.id === me) ?? users[0];

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={logout}
      aria-label="Log out"
      className="press flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-ink-soft"
    >
      <Avatar initials={cur.initials} color={cur.color} size={32} />
      <span className="text-[13px] font-semibold">Log out</span>
    </button>
  );
}
