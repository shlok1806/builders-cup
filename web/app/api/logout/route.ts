import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ME_COOKIE } from "@/lib/auth";

export async function POST() {
  (await cookies()).delete(ME_COOKIE);
  return NextResponse.json({ ok: true });
}
