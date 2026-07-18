"use client";

import { useEffect, useRef, useState } from "react";

/* ---------- Icons (stroke = currentColor) ---------- */
const PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>,
  back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  cart: <><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /><path d="M2.5 3.5H5l2.2 11a1.4 1.4 0 0 0 1.4 1.1h8.6a1.4 1.4 0 0 0 1.4-1.1L21.5 7H5.7" /></>,
  split: <><path d="M12 3a9 9 0 1 0 9 9h-9Z" /><path d="M12 3v9" /></>,
  rules: <><path d="M4 7h11M4 12h16M4 17h8" /><circle cx="18" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10.4 20a2 2 0 0 0 3.2 0" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  wine: <path d="M8 22h8M12 15v7M5 3h14l-1.2 6.5a6 6 0 0 1-11.6 0Z" />,
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.3 6.3 0 0 0 9.5 9.5Z" />,
  cog: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19" /></>,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.9, className }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Status-bar clock (live) ---------- */
// Empty until mounted so SSR and first client render match (no hydration warn),
// then the real time; updates each minute.
export function Clock({ className }: { className?: string }) {
  const [t, setT] = useState("");
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
    setT(fmt());
    const id = setInterval(() => setT(fmt()), 30000);
    return () => clearInterval(id);
  }, []);
  return <span className={className}>{t}</span>;
}

/* ---------- Avatar ---------- */
const BG: Record<string, string> = {
  groceries: "bg-groceries", meat: "bg-meat", alcohol: "bg-alcohol",
  household: "bg-household", snacks: "bg-snacks", cleaning: "bg-cleaning",
};
export function Avatar({ initials, color, size = 40, ring }: { initials: string; color: string; size?: number; ring?: string }) {
  return (
    <div
      className={`${BG[color] ?? "bg-accent"} grid place-items-center rounded-full font-display font-bold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.34, letterSpacing: "0.02em", boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      {initials}
    </div>
  );
}

/* ---------- Check badge (pops on mount) ---------- */
export function CheckBadge({ size = 18, delay = 0 }: { size?: number; delay?: number }) {
  return (
    <span className="a-pop grid place-items-center rounded-full bg-positive text-white" style={{ width: size, height: size, animationDelay: `${delay}ms` }}>
      <Icon name="check" size={size * 0.6} strokeWidth={3.2} />
    </span>
  );
}

/* ---------- Count-up (respects reduced motion) ---------- */
export function useCountUp(target: number, { duration = 900, decimals = 2 }: { duration?: number; decimals?: number } = {}) {
  const [val, setVal] = useState(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    setVal(0);
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function CountUp({ target, className, decimals = 2 }: { target: number; className?: string; decimals?: number }) {
  const s = useCountUp(target, { decimals });
  return <span className={className}>{s}</span>;
}

/* ---------- Theme toggle ---------- */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const explicit = el.getAttribute("data-theme");
    setDark(explicit ? explicit === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try { localStorage.setItem("cartel-theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="press grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-surface text-ink-soft">
      <Icon name={dark ? "sun" : "moon"} size={20} />
    </button>
  );
}
