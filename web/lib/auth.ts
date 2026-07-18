// Mock demo auth — a shared password unlocks a chosen user, stored as a plain
// (non-httpOnly, so useMe can read it) cookie holding just the user id. No real
// secrets in the cookie; this only decides "which of the 4 demo users is this
// phone". ponytail: one shared password via env, fine for a 4-phone demo.
export const ME_COOKIE = "cartel-me";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function demoPassword(): string {
  return process.env.DEMO_PASSWORD ?? "demo";
}
