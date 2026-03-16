import { Suspense } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <Suspense>{children}</Suspense>
    </div>
  );
}
