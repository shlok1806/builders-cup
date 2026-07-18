"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUsers } from "@/lib/useUsers";

// Mock login for the 4-phone demo: username = a user's first name, shared
// password. Social buttons + sign-up are decorative (demo only).
export default function Login() {
  const { users } = useUsers();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = username.trim().toLowerCase();
    if (!name || !pw) return;
    const user = users.find((u) => u.name.toLowerCase() === name);
    if (!user) {
      setErr("Unknown user.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, password: pw }),
      });
      if (r.ok) {
        router.push("/");
        router.refresh();
      } else {
        setErr((await r.json().catch(() => ({}))).error ?? "Login failed.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const demoOnly = () => setErr("Demo only — use username & password above.");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center bg-bg px-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Cartel</h1>
      <p className="mt-1 text-[14px] font-medium text-ink-soft">Log in to your household.</p>

      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="Username"
        className="mt-6 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Password"
        className="mt-3 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      <button
        onClick={submit}
        disabled={busy || !username.trim() || !pw}
        className="press mt-4 w-full rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-45"
      >
        {busy ? "Logging in…" : "Log in"}
      </button>
      {err && <p className="mt-2 text-[12px] font-medium text-red-500">{err}</p>}

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] font-medium text-ink-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-3">
        <button
          onClick={demoOnly}
          className="press flex w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface py-3 text-[14px] font-semibold text-ink"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <button
          onClick={demoOnly}
          className="press flex w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface py-3 text-[14px] font-semibold text-ink"
        >
          <AppleIcon />
          Continue with Apple
        </button>
      </div>

      <p className="mt-6 text-center text-[13px] font-medium text-ink-soft">
        Don&rsquo;t have an account?{" "}
        <button onClick={demoOnly} className="font-semibold text-accent-ink underline-offset-2 hover:underline">
          Sign up
        </button>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 14 17" aria-hidden fill="currentColor">
      <path d="M11.62 8.94c-.02-1.86 1.52-2.75 1.59-2.8-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.82.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.05 1.85-1.3 2.25-.33 5.58.93 7.4.62.9 1.36 1.9 2.32 1.86.93-.04 1.29-.6 2.41-.6 1.12 0 1.44.6 2.42.58 1-.02 1.63-.91 2.24-1.81.71-1.04 1-2.05 1.02-2.1-.02-.01-1.95-.75-1.97-2.97zM9.77 3.3c.51-.62.86-1.48.76-2.34-.74.03-1.63.49-2.16 1.11-.47.55-.89 1.43-.78 2.27.82.07 1.67-.42 2.18-1.04z" />
    </svg>
  );
}
