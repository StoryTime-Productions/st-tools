import { Skeleton } from "@/components/ui/skeleton";

export default function BoardsLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading boards</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-11 w-28 sm:h-9" />
      </div>
      <div className="border-border/70 rounded-3xl border">
        {[0, 1, 2].map((row) => (
          <div key={row} className="border-border/60 space-y-2 border-b px-4 py-4 last:border-b-0">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
