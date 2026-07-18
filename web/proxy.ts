import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth gate for the mock demo: no cartel-me cookie -> bounce to /login.
// (Cookie name inlined; proxy shouldn't rely on shared app modules.)
const ME_COOKIE = "cartel-me";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Always open: the login page and the approval device (identifies itself via ?user=).
  if (pathname === "/login" || pathname.startsWith("/approve") || searchParams.has("user")) {
    return NextResponse.next();
  }
  if (!request.cookies.get(ME_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on pages only — skip api, static assets, and image files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
