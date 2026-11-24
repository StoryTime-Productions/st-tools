import { ListChecks } from "lucide-react";
import { BucketItemCard } from "@/app/bucket-list/_components/bucket-item-card";
import { BucketItemDialog } from "@/app/bucket-list/_components/bucket-item-dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  BUCKET_STATUSES,
  statusLabel,
  type BucketItemView,
  type BucketStatus,
} from "@/lib/bucket-list-core";

export interface BucketViewer {
  id: string;
  role: "ADMIN" | "MEMBER";
}

const EMPTY_COPY: Record<BucketStatus, { title: string; hint: string }> = {
  TODO: { title: "Nothing to do yet", hint: "Add the first idea with the button above." },
  IN_PLAN: { title: "Nothing in plan", hint: "Items being planned as a hangout show up here." },
  DONE: { title: "Nothing done yet", hint: "Tick an item once it has happened." },
};

function EmptyColumn({ status }: { status: BucketStatus }) {
  const copy = EMPTY_COPY[status];
  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-2xl">
          <ListChecks className="text-muted-foreground size-6" aria-hidden="true" />
        </div>
        <p className="font-medium">{copy.title}</p>
        <p className="text-muted-foreground max-w-xs text-sm leading-6">{copy.hint}</p>
      </CardContent>
    </Card>
  );
}

export function BucketListView({
  grouped,
  tagNames,
  viewer,
}: {
  grouped: Record<BucketStatus, BucketItemView[]>;
  tagNames: string[];
  viewer: BucketViewer;
}) {
  const total = BUCKET_STATUSES.reduce((sum, status) => sum + grouped[status].length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">The bucket list</h1>
          <p className="text-muted-foreground text-sm">
            Things the group wants to do. Anyone can add one or tick it done.
          </p>
        </div>
        <BucketItemDialog tagNames={tagNames} isAdmin={viewer.role === "ADMIN"} />
      </div>

      {total === 0 ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
              <ListChecks className="text-muted-foreground size-7" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">The list is empty</h2>
              <p className="text-muted-foreground max-w-md text-sm leading-6">
                Use Add an item for the first thing the group has always wanted to do.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          {BUCKET_STATUSES.map((status) => (
            <section key={status} aria-labelledby={`bucket-${status}`} className="space-y-3">
              <h2
                id={`bucket-${status}`}
                className="flex items-baseline justify-between px-1 text-base font-semibold"
              >
                {statusLabel(status)}
                <span className="text-muted-foreground font-normal">{grouped[status].length}</span>
              </h2>
              {grouped[status].length === 0 ? (
                <EmptyColumn status={status} />
              ) : (
                <ul className="space-y-3">
                  {grouped[status].map((item) => (
                    <li key={item.id}>
                      <BucketItemCard item={item} viewer={viewer} tagNames={tagNames} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
