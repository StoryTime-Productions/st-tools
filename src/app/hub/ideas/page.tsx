import { redirect } from "next/navigation";
import { HubTabs } from "@/app/hub/_components/hub-tabs";
import { IdeaActions } from "@/app/hub/ideas/_components/idea-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      <p className="text-muted-foreground text-sm">
        Hangout ideas proposed in Discord.
        {isAdmin ? " Promote one to start collecting availability." : ""}
      </p>
      {ideas.length === 0 ? (
        <p className="text-muted-foreground text-sm">No ideas yet.</p>
      ) : (
        <ul className="space-y-3">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="border-border/70 bg-background/85 flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <h2 className="font-medium">{idea.title}</h2>
                {idea.details ? (
                  <p className="text-sm leading-6 whitespace-pre-line">{idea.details}</p>
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
