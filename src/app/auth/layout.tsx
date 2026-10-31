import { Suspense } from "react";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/30 relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Image
        src="/icon.jpg"
        alt="StoryTime Tools"
        width={64}
        height={64}
        className="size-16 rounded-2xl object-cover"
      />
      <Suspense>{children}</Suspense>
    </main>
  );
}
