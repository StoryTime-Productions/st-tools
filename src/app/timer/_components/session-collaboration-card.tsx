"use client";

import { useState } from "react";
import { DoorOpen, MoreHorizontal, UserPlus, Users } from "lucide-react";
import type {
  FocusSessionDetailSnapshot,
  FocusSessionListItemSnapshot,
  FocusSessionRequestSnapshot,
  PomodoroCollaborationSnapshot,
} from "@/lib/pomodoro";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getDisplayName, initialsFromName } from "./timer-utils";

interface SessionCollaborationCardProps {
  currentUserId: string;
  currentSession: FocusSessionDetailSnapshot | null;
  joinableSessions: FocusSessionListItemSnapshot[];
  inviteCandidates: PomodoroCollaborationSnapshot["inviteCandidates"];
  incomingRequests: FocusSessionRequestSnapshot[];
  outgoingRequests: FocusSessionRequestSnapshot[];
  isBusy: boolean;
  titleInput: string;
  onTitleChange: (value: string) => void;
  onStartOwn: () => void;
  onJoin: (sessionId: string) => void;
  onLeave: () => void;
  onAddMember: (userId: string) => void;
  onKick: (userId: string) => void;
  onRespond: (requestId: string, decision: "accept" | "decline") => void;
}

function PersonAvatar({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  return (
    <Avatar size="sm" className="shrink-0">
      <AvatarImage src={avatarUrl ?? undefined} alt={getDisplayName(name, email)} />
      <AvatarFallback>{initialsFromName(name, email)}</AvatarFallback>
    </Avatar>
  );
}

export function SessionCollaborationCard({
  currentUserId,
  currentSession,
  joinableSessions,
  inviteCandidates,
  incomingRequests,
  outgoingRequests,
  isBusy,
  titleInput,
  onTitleChange,
  onStartOwn,
  onJoin,
  onLeave,
  onAddMember,
  onKick,
  onRespond,
}: SessionCollaborationCardProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [pickedCandidateId, setPickedCandidateId] = useState("");

  const isOwner = currentSession?.ownerId === currentUserId;
  const selectedCandidateId = inviteCandidates.some(
    (candidate) => candidate.id === pickedCandidateId
  )
    ? pickedCandidateId
    : (inviteCandidates[0]?.id ?? "");

  return (
    <Card className="border-border/70 bg-background/85 gap-4 rounded-3xl shadow-none">
      <CardHeader className="gap-0">
        <CardTitle className="text-base">Session collaboration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {incomingRequests.length > 0 ? (
          <section aria-label="Requests for you" className="space-y-2">
            {incomingRequests.map((request) => (
              <div
                key={request.id}
                className="bg-muted/50 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{request.sessionTitle}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    Invited by {getDisplayName(request.requesterName, request.requesterEmail)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => onRespond(request.id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => onRespond(request.id, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {currentSession ? (
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{currentSession.title}</p>
                <p className="text-muted-foreground truncate text-xs">
                  Hosted by {currentSession.ownerName}
                </p>
              </div>
            </div>

            <p role="status" className="sr-only">
              {currentSession.members.length} member{currentSession.members.length === 1 ? "" : "s"}{" "}
              in session
            </p>

            <ul className="space-y-1">
              {currentSession.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <PersonAvatar
                      name={member.name}
                      email={member.email}
                      avatarUrl={member.avatarUrl}
                    />
                    <span className="truncate">
                      {getDisplayName(member.name, member.email)}
                      {member.userId === currentUserId ? " (You)" : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {member.isOwner ? <Badge variant="outline">Owner</Badge> : null}
                    {isOwner && !member.isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isBusy}
                            aria-label={`Manage ${getDisplayName(member.name, member.email)}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onKick(member.userId)}
                          >
                            Remove from session
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              ))}
              {outgoingRequests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <PersonAvatar
                      name={request.targetName}
                      email={request.targetEmail}
                      avatarUrl={null}
                    />
                    <span className="truncate">
                      {getDisplayName(request.targetName, request.targetEmail)}
                    </span>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </li>
              ))}
            </ul>

            {isOwner ? (
              showInvite ? (
                inviteCandidates.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Person to invite"
                      value={selectedCandidateId}
                      onChange={(event) => setPickedCandidateId(event.target.value)}
                      className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
                    >
                      {inviteCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {getDisplayName(candidate.name, candidate.email)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onAddMember(selectedCandidateId)}
                      disabled={isBusy || !selectedCandidateId}
                      className="shrink-0 gap-1.5"
                    >
                      <UserPlus className="size-4" />
                      Send request
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No additional members available.</p>
                )
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowInvite(true)}
                >
                  <UserPlus className="size-4" />
                  Add
                </Button>
              )
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onLeave}
                disabled={isBusy}
                className="gap-2"
              >
                <DoorOpen className="size-4" />
                Leave
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onStartOwn}
                disabled={isBusy}
                className="gap-2"
              >
                <Users className="size-4" />
                Leave and start my own
              </Button>
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Focus together. Start a session or join one.
            </p>
            <div className="flex gap-2">
              <Input
                aria-label="Session title"
                value={titleInput}
                onChange={(event) => onTitleChange(event.target.value)}
                maxLength={80}
                placeholder="Title (optional)"
                disabled={isBusy}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                onClick={onStartOwn}
                disabled={isBusy}
                className="shrink-0 gap-2"
              >
                <Users className="size-4" />
                Start session
              </Button>
            </div>
          </section>
        )}

        {joinableSessions.length > 0 || !currentSession ? (
          <section aria-label="Join a session" className="space-y-2">
            <p className="text-xs font-medium tracking-[0.2em] uppercase">Join a session</p>
            {joinableSessions.length > 0 ? (
              joinableSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{session.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {session.memberCount} member{session.memberCount === 1 ? "" : "s"} · Hosted by{" "}
                      {session.ownerName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => onJoin(session.id)}
                  >
                    Join
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No active sessions to join yet.</p>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
