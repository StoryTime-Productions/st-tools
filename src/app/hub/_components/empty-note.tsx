import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A muted icon-plus-sentence note for an empty card section. */
export function EmptyNote({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-sm">
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <p>{children}</p>
    </div>
  );
}
