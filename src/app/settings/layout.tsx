import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Manage your account settings and preferences.
          </p>
        </div>
        <Separator className="mb-8" />
        {children}
      </div>
    </div>
  );
}
