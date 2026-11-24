import { Skeleton } from "@/components/ui/skeleton";

export default function BucketListLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading the bucket list</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-11 w-32 sm:h-9" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div key={column} className="space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-24 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl max-xl:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
