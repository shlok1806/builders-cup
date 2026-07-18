"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { demoPrompt } from "@/lib/data";

// Free-typed cart text + a one-tap chip pre-filled with the canonical demo
// prompt (so the presenter never retypes, and P2's normalized cache hits).
export default function CartInput({ onBuild, loading }: { onBuild: (text: string) => void; loading: boolean }) {
  const [text, setText] = useState("");

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
        What did we buy?
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="tequila, ribeye, chips…"
        rows={3}
        className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      <button
        onClick={() => setText(demoPrompt)}
        className="press flex w-full items-center gap-2 rounded-full border border-line bg-surface-2 px-3.5 py-2 text-left text-[12.5px] font-medium text-ink-soft"
      >
        <Icon name="plus" size={15} strokeWidth={2.2} className="shrink-0 text-accent-ink" />
        <span className="truncate">Use demo cart · {demoPrompt}</span>
      </button>

      <button
        onClick={() => text.trim() && onBuild(text.trim())}
        disabled={!text.trim() || loading}
        className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-[15.5px] font-semibold text-on-accent disabled:opacity-45"
      >
        <Icon name="cart" size={19} />
        {loading ? "Building…" : "Build cart"}
      </button>
    </div>
  );
}
