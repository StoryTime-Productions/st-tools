"use client";

import { useState } from "react";
import { DoorOpen, MoreHorizontal, UserPlus, Users, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  onCancelRequest: (requestId: string) => void;
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
      <AvatarImage src={avatarUrl ?? undefined} alt="" />
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
  onCancelRequest,
  onRespond,
}: SessionCollaborationCardProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [pickedCandidateId, setPickedCandidateId] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; name: string } | null>(
    null
  );

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
      <CardContent className="space-y-5">
        {incomingRequests.length > 0 ? (
          <section aria-label="Requests for you" className="space-y-2">
            {incomingRequests.map((request) => (
              <div
                key={request.id}
                className="bg-muted/50 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-xl px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1 basis-40">
                  <p className="line-clamp-2 font-medium" title={request.sessionTitle}>
                    {request.sessionTitle}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    Invited by {getDisplayName(request.requesterName, request.requesterEmail)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={isBusy}
                    aria-label={`Accept invite to ${request.sessionTitle}`}
                    onClick={() => onRespond(request.id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={isBusy}
                    aria-label={`Decline invite to ${request.sessionTitle}`}
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
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium">{currentSession.title}</h2>
              <p className="text-muted-foreground truncate text-xs">
                {isOwner ? "You're hosting" : `Hosted by ${currentSession.ownerName}`}
              </p>
            </div>

            <p role="status" className="sr-only">
              {currentSession.members.length} member{currentSession.members.length === 1 ? "" : "s"}{" "}
              in session
            </p>

            <ul className="space-y-1">
              {currentSession.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex min-h-11 items-center justify-between gap-2 py-1"
                >
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
                            size="icon"
                            className="size-11"
                            disabled={isBusy}
                            aria-label={`Manage ${getDisplayName(member.name, member.email)}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setMemberToRemove({
                                userId: member.userId,
                                name: getDisplayName(member.name, member.email),
                              })
                            }
                          >
                            Remove from session
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {outgoingRequests.length > 0 ? (
              <div className="space-y-1">
                <h3 className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
                  Pending invites
                </h3>
                <ul className="space-y-1">
                  {outgoingRequests.map((request) => {
                    const name = getDisplayName(request.targetName, request.targetEmail);

                    return (
                      <li
                        key={request.id}
                        className="flex min-h-11 items-center justify-between gap-2 py-1"
                      >
                        <div className="flex min-w-0 items-center gap-2 text-sm">
                          <PersonAvatar
                            name={request.targetName}
                            email={request.targetEmail}
                            avatarUrl={null}
                          />
                          <span className="truncate">{name}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge variant="secondary">Pending</Badge>
                          {isOwner ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11"
                              disabled={isBusy}
                              aria-label={`Cancel invite to ${name}`}
                              onClick={() => onCancelRequest(request.id)}
                            >
                              <X className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {isOwner ? (
              showInvite ? (
                inviteCandidates.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Person to invite"
                      value={selectedCandidateId}
                      onChange={(event) => setPickedCandidateId(event.target.value)}
                      className="border-input bg-background h-11 min-w-0 flex-1 basis-40 rounded-md border px-3 text-sm"
                    >
                      {inviteCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {getDisplayName(candidate.name, candidate.email)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      className="min-h-11 shrink-0 gap-1.5"
                      onClick={() => onAddMember(selectedCandidateId)}
                      disabled={isBusy || !selectedCandidateId}
                    >
                      <UserPlus className="size-4" />
                      Send request
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 shrink-0 px-0"
                      onClick={() => setShowInvite(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-muted-foreground text-sm">
                      No additional members available.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => setShowInvite(false)}
                    >
                      Close
                    </Button>
                  </div>
                )
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 justify-start gap-1.5 px-0 has-[>svg]:px-0"
                  onClick={() => setShowInvite(true)}
                >
                  <UserPlus className="size-4" />
                  Invite someone
                </Button>
              )
            ) : null}

            <div className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onLeave}
                  disabled={isBusy}
                  className="min-h-11 gap-2"
                >
                  <DoorOpen className="size-4" />
                  Leave
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onStartOwn}
                  disabled={isBusy}
                  className="min-h-11 gap-2"
                >
                  <Users className="size-4" />
                  Leave and start my own
                </Button>
              </div>
              {isOwner ? (
                <p className="text-muted-foreground text-xs">
                  Leaving hands hosting to the longest-standing member, or ends the session if
                  you&apos;re the last one.
                </p>
              ) : null}
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
                className="h-11 min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onStartOwn}
                disabled={isBusy}
                className="min-h-11 shrink-0 gap-2"
              >
                <Users className="size-4" />
                Start session
              </Button>
            </div>
          </section>
        )}

        {joinableSessions.length > 0 || !currentSession ? (
          <section aria-labelledby="join-session-heading" className="space-y-2">
            <h2
              id="join-session-heading"
              className="text-xs font-medium tracking-[0.2em] uppercase"
            >
              Join a session
            </h2>
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
                    className="min-h-11"
                    disabled={isBusy}
                    aria-label={`Join ${session.title}`}
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

      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {memberToRemove?.name} from the session?</DialogTitle>
            <DialogDescription>
              They will leave the shared timer straight away. You can invite them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setMemberToRemove(null)}>
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy}
              onClick={() => {
                if (memberToRemove) onKick(memberToRemove.userId);
                setMemberToRemove(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
