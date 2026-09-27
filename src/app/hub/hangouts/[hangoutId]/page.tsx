import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CancelHangoutButton, HangoutDialog } from "@/app/hub/_components/hangout-dialog";
import { ProjectCover } from "@/app/hub/_components/project-cover";
import { ProjectCoverEditor } from "@/app/hub/projects/[projectId]/_components/project-cover-editor";
import { getCurrentUser } from "@/lib/get-current-user";
import { getHangoutDetail, HANGOUT_STATUS_LABEL } from "@/lib/hangouts";

export default async function HangoutPage({ params }: { params: Promise<{ hangoutId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { hangoutId } = await params;
  const hangout = await getHangoutDetail(hangoutId);
  if (!hangout) notFound();

  const canEdit = user.role === "ADMIN" && hangout.status !== "CANCELLED";

  return (
    <div className="space-y-6">
      <Link
        href="/hub"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" />
        Hub
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <ProjectCover
            title={hangout.title}
            coverImageUrl={hangout.coverImageUrl}
            className="size-16 text-lg"
          />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{hangout.title}</h2>
            <Badge variant={hangout.status === "CANCELLED" ? "outline" : "secondary"}>
              {HANGOUT_STATUS_LABEL[hangout.status]}
            </Badge>
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <HangoutDialog hangout={hangout} />
            <CancelHangoutButton hangoutId={hangout.id} title={hangout.title} />
          </div>
        ) : null}
      </div>

      {hangout.description ? (
        <p className="max-w-3xl text-sm leading-6 whitespace-pre-line">{hangout.description}</p>
      ) : null}

      {hangout.discordThreadUrl ? (
        <a
          href={hangout.discordThreadUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted/40 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Discord thread
        </a>
      ) : null}

      {canEdit ? (
        <div className="max-w-xl">
          <ProjectCoverEditor
            id={hangout.id}
            title={hangout.title}
            coverImageUrl={hangout.coverImageUrl}
            kind="hangout"
          />
        </div>
      ) : null}
    </div>
  );
}
