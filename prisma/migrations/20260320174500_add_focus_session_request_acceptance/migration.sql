CREATE TYPE "FocusSessionRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "pomodoro_focus_session_requests" (
    "id" TEXT NOT NULL,
    "status" "FocusSessionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,

    CONSTRAINT "pomodoro_focus_session_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pomodoro_focus_session_requests_sessionId_status_idx"
ON "pomodoro_focus_session_requests"("sessionId", "status");

CREATE INDEX "pomodoro_focus_session_requests_requesterId_status_idx"
ON "pomodoro_focus_session_requests"("requesterId", "status");

CREATE INDEX "pomodoro_focus_session_requests_targetUserId_status_idx"
ON "pomodoro_focus_session_requests"("targetUserId", "status");

CREATE UNIQUE INDEX "pomodoro_focus_session_requests_one_pending_per_session_target_idx"
ON "pomodoro_focus_session_requests"("sessionId", "targetUserId")
WHERE "status" = 'PENDING';

ALTER TABLE "pomodoro_focus_session_requests"
ADD CONSTRAINT "pomodoro_focus_session_requests_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "pomodoro_focus_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pomodoro_focus_session_requests"
ADD CONSTRAINT "pomodoro_focus_session_requests_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pomodoro_focus_session_requests"
ADD CONSTRAINT "pomodoro_focus_session_requests_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."pomodoro_focus_session_requests" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pomodoro_focus_session_requests_select_related_or_admin ON public."pomodoro_focus_session_requests";
CREATE POLICY pomodoro_focus_session_requests_select_related_or_admin
ON public."pomodoro_focus_session_requests"
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR "requesterId" = auth.uid()::text
  OR "targetUserId" = auth.uid()::text
);

DROP POLICY IF EXISTS pomodoro_focus_session_requests_insert_owner_or_admin ON public."pomodoro_focus_session_requests";
CREATE POLICY pomodoro_focus_session_requests_insert_owner_or_admin
ON public."pomodoro_focus_session_requests"
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    "requesterId" = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public."pomodoro_focus_sessions" AS session
      WHERE session.id = "sessionId"
        AND session."ownerId" = auth.uid()::text
    )
  )
);

DROP POLICY IF EXISTS pomodoro_focus_session_requests_update_related_or_admin ON public."pomodoro_focus_session_requests";
CREATE POLICY pomodoro_focus_session_requests_update_related_or_admin
ON public."pomodoro_focus_session_requests"
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR "requesterId" = auth.uid()::text
  OR "targetUserId" = auth.uid()::text
)
WITH CHECK (
  public.is_admin()
  OR "requesterId" = auth.uid()::text
  OR "targetUserId" = auth.uid()::text
);

DROP POLICY IF EXISTS pomodoro_focus_session_requests_delete_owner_or_admin ON public."pomodoro_focus_session_requests";
CREATE POLICY pomodoro_focus_session_requests_delete_owner_or_admin
ON public."pomodoro_focus_session_requests"
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR "requesterId" = auth.uid()::text
);
