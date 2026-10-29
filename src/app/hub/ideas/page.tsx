import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { HubTabs } from "@/app/hub/_components/hub-tabs";
import { IdeaActions } from "@/app/hub/ideas/_components/idea-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/get-current-user";
import { getOpenIdeas } from "@/lib/hangouts";
import { projectInitials } from "@/lib/hub-format";

export default async function HubIdeasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const ideas = await getOpenIdeas();
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-6">
      <HubTabs active="/hub/ideas" />
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Ideas</h2>
        <p className="text-muted-foreground text-sm">
          Hangout ideas proposed in Discord.
          {isAdmin ? " Promote one to start collecting availability." : ""}
        </p>
      </div>
      {ideas.length === 0 ? (
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
              <Lightbulb className="text-muted-foreground size-7" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight">No ideas yet</h3>
              <p className="text-muted-foreground max-w-md text-sm leading-6">
                Propose one in Discord with <code className="font-mono">/idea</code>.
                {isAdmin ? " Promoted ideas become hangouts." : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="border-border/70 bg-background/85 flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <h3 className="font-medium break-words">{idea.title}</h3>
                {idea.details ? (
                  <p className="text-sm leading-6 break-words whitespace-pre-line">
                    {idea.details}
                  </p>
                ) : null}
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Avatar className="size-5">
                    <AvatarImage src={idea.proposerAvatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-[9px]">
                      {projectInitials(idea.proposerName)}
                    </AvatarFallback>
                  </Avatar>
                  {idea.proposerName} ·{" "}
                  {idea.createdAt.toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/Toronto",
                  })}
                </p>
              </div>
              {isAdmin ? <IdeaActions ideaId={idea.id} title={idea.title} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
