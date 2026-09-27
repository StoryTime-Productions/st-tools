"use client";

import { useState } from "react";
import { Github, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GithubIssueRef } from "@/lib/github";

interface CardGithubIssueProps {
  issue: GithubIssueRef | null;
  isPending: boolean;
  onSet: (url: string | null) => Promise<boolean>;
}

export function GithubIssueState({ issue }: { issue: GithubIssueRef }) {
  if (!issue.state) return null;
  return (
    <Badge variant={issue.state === "open" ? "secondary" : "outline"}>
      {issue.state === "open" ? "Open" : "Closed"}
    </Badge>
  );
}

export function CardGithubIssue({ issue, isPending, onSet }: CardGithubIssueProps) {
  const [url, setUrl] = useState("");

  async function link() {
    if (url.trim() && (await onSet(url.trim()))) setUrl("");
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">GitHub issue</legend>
      {issue ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-2 hover:underline"
          >
            <Github className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{issue.label}</span>
          </a>
          <span className="flex shrink-0 items-center gap-1">
            <GithubIssueState issue={issue} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Unlink GitHub issue"
              disabled={isPending}
              onClick={() => void onSet(null)}
            >
              <X className="size-4" />
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            aria-label="GitHub issue URL"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void link();
              }
            }}
            placeholder="https://github.com/owner/repo/issues/12"
            disabled={isPending}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void link()}
            disabled={isPending || !url.trim()}
          >
            Link
          </Button>
        </div>
      )}
    </fieldset>
  );
}
