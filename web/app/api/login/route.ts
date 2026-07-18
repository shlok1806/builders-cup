import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ME_COOKIE, SESSION_MAX_AGE, demoPassword } from "@/lib/auth";

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// POST { userId, password } -> sets the cartel-me cookie on a correct password.
export async function POST(req: Request) {
  let body: { userId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.userId || !isUuid(body.userId)) {
    return NextResponse.json({ error: "Pick a user." }, { status: 400 });
  }
  if (body.password !== demoPassword()) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  (await cookies()).set(ME_COOKIE, body.userId, {
    path: "/",
    maxAge: SESSION_MAX_AGE,
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true });
}
