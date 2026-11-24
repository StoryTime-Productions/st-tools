import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function BucketListLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return (
    <WorkspaceShell user={user} activeNav="bucket-list" title="ST-uff">
      {children}
    </WorkspaceShell>
  );
}
