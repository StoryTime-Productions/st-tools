import { Suspense } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <Suspense>{children}</Suspense>
    </div>
  );
}
