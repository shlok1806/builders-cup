import ApprovalView from "./view";
import { cookies } from "next/headers";
import { ME_COOKIE } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user } = await searchParams;
  const cookieStore = await cookies();
  return <ApprovalView user={user ?? cookieStore.get(ME_COOKIE)?.value ?? ""} />;
}
