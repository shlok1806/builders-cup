import ApprovalView from "./view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user } = await searchParams;
  return <ApprovalView user={user ?? "sam"} />;
}
