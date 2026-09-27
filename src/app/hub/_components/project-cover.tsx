import { projectInitials } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

export function ProjectCover({
  title,
  coverImageUrl,
  className,
}: {
  title: string;
  coverImageUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted text-foreground/80 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-semibold",
        className
      )}
      aria-hidden="true"
    >
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverImageUrl} alt="" className="size-full object-cover" />
      ) : (
        projectInitials(title)
      )}
    </div>
  );
}
