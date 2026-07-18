// F3 — Policy compiler route (Call B).
// POST { userId, text } -> { policy:{ id, type, params, source_text } }
//
// Compiles one plain-English rule into one structured policy row and persists
// it. Runs at rule-creation time, never on the money path.

import { NextResponse } from "next/server";
import { compilePolicy } from "@/lib/openai";
import { insertPolicy } from "@/lib/agent-data";

export async function POST(req: Request) {
  let body: { userId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const outcome = await compilePolicy(text);
    if (!outcome.ok) {
      // Out-of-scope rule — refuse with a helpful hint instead of storing a
      // silently-wrong policy. The settings UI surfaces `error` on !r.ok.
      return NextResponse.json({ error: outcome.reason }, { status: 422 });
    }
    const { type, params } = outcome;
    const policy = await insertPolicy({
      userId: body.userId,
      type,
      params,
      source_text: text,
    });

    return NextResponse.json({
      policy: {
        id: policy.id,
        type: policy.type,
        params: policy.params,
        source_text: policy.source_text,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
