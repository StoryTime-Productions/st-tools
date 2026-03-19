import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/get-current-user";
import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return (
    <WorkspaceShell user={user} activeNav="profile" title="Settings">
      {children}
    </WorkspaceShell>
  );
}
