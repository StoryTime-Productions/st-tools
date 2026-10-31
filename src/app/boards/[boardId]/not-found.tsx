import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BoardNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
        <Lock aria-hidden="true" className="text-muted-foreground size-7" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        This board doesn&apos;t exist or you don&apos;t have access
      </h2>
      <p className="text-muted-foreground max-w-md text-sm leading-6">
        Ask the board owner to add you, or go back to the boards you can open.
      </p>
      <Button asChild>
        <Link href="/boards">Back to boards</Link>
      </Button>
    </div>
  );
}
