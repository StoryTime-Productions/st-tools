import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function HubLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return (
    <WorkspaceShell user={user} activeNav="hub" title="Hub">
      {children}
    </WorkspaceShell>
  );
}
