import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";
import AIChatbot from "@/components/AIChatbot";

// Single source of truth for who can see the dashboard. Must match
// src/components/ActionItems.tsx so the UI assignee logic stays in sync.
const ALLOWED_DOMAIN = "redhorncapital.com";
const SILENT_EMAILS = new Set<string>([
  "sheharyarmonnoo@gmail.com",
  "mattyellin1@gmail.com",
  // Dillon: add when his login email is known
]);

async function isAuthorized(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  // Walk every verified email on the account — Clerk lets a user have
  // several. Any one matching the allowlist is enough.
  for (const e of user.emailAddresses) {
    const addr = e.emailAddress.toLowerCase();
    if (SILENT_EMAILS.has(addr)) return true;
    if (addr.endsWith(`@${ALLOWED_DOMAIN}`)) return true;
  }
  return false;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const ok = await isAuthorized(userId);
  if (!ok) redirect("/unauthorized");

  return (
    <>
      <Sidebar />
      <MainContent>{children}</MainContent>
      <AIChatbot />
    </>
  );
}
