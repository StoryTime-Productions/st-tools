CREATE TABLE "pomodoro_focus_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "pomodoro_focus_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pomodoro_focus_session_members" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "pomodoro_focus_session_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "minigame_leaderboard_entries" (
    "id" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "allTimeScore" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "minigame_leaderboard_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pomodoro_focus_session_members_sessionId_userId_key"
ON "pomodoro_focus_session_members"("sessionId", "userId");

CREATE INDEX "pomodoro_focus_session_members_userId_isActive_idx"
ON "pomodoro_focus_session_members"("userId", "isActive");

CREATE INDEX "pomodoro_focus_session_members_sessionId_isActive_idx"
ON "pomodoro_focus_session_members"("sessionId", "isActive");

CREATE UNIQUE INDEX "pomodoro_focus_session_members_one_active_per_user_idx"
ON "pomodoro_focus_session_members"("userId")
WHERE "isActive" = true;

CREATE INDEX "pomodoro_focus_sessions_isActive_createdAt_idx"
ON "pomodoro_focus_sessions"("isActive", "createdAt");

CREATE UNIQUE INDEX "minigame_leaderboard_entries_gameKey_userId_key"
ON "minigame_leaderboard_entries"("gameKey", "userId");

CREATE INDEX "minigame_leaderboard_entries_gameKey_allTimeScore_idx"
ON "minigame_leaderboard_entries"("gameKey", "allTimeScore");

ALTER TABLE "pomodoro_focus_sessions"
ADD CONSTRAINT "pomodoro_focus_sessions_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pomodoro_focus_session_members"
ADD CONSTRAINT "pomodoro_focus_session_members_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "pomodoro_focus_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pomodoro_focus_session_members"
ADD CONSTRAINT "pomodoro_focus_session_members_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "minigame_leaderboard_entries"
ADD CONSTRAINT "minigame_leaderboard_entries_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.can_access_focus_session(target_session_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public."pomodoro_focus_sessions" AS session
      WHERE session.id = target_session_id
        AND session."ownerId" = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1
      FROM public."pomodoro_focus_session_members" AS membership
      WHERE membership."sessionId" = target_session_id
        AND membership."userId" = auth.uid()::text
        AND membership."isActive" = true
    );
$$;

ALTER TABLE public."pomodoro_focus_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pomodoro_focus_session_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."minigame_leaderboard_entries" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pomodoro_focus_sessions_select_member_or_owner_or_admin ON public."pomodoro_focus_sessions";
CREATE POLICY pomodoro_focus_sessions_select_member_or_owner_or_admin
ON public."pomodoro_focus_sessions"
FOR SELECT
TO authenticated
USING (public.can_access_focus_session(id));

DROP POLICY IF EXISTS pomodoro_focus_sessions_insert_owner_or_admin ON public."pomodoro_focus_sessions";
CREATE POLICY pomodoro_focus_sessions_insert_owner_or_admin
ON public."pomodoro_focus_sessions"
FOR INSERT
TO authenticated
WITH CHECK (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_focus_sessions_update_owner_or_admin ON public."pomodoro_focus_sessions";
CREATE POLICY pomodoro_focus_sessions_update_owner_or_admin
ON public."pomodoro_focus_sessions"
FOR UPDATE
TO authenticated
USING (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
)
WITH CHECK (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_focus_sessions_delete_owner_or_admin ON public."pomodoro_focus_sessions";
CREATE POLICY pomodoro_focus_sessions_delete_owner_or_admin
ON public."pomodoro_focus_sessions"
FOR DELETE
TO authenticated
USING (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_focus_session_members_select_related_or_admin ON public."pomodoro_focus_session_members";
CREATE POLICY pomodoro_focus_session_members_select_related_or_admin
ON public."pomodoro_focus_session_members"
FOR SELECT
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.can_access_focus_session("sessionId")
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_focus_session_members_insert_owner_or_self_or_admin ON public."pomodoro_focus_session_members";
CREATE POLICY pomodoro_focus_session_members_insert_owner_or_self_or_admin
ON public."pomodoro_focus_session_members"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public."pomodoro_focus_sessions" AS session
    WHERE session.id = "sessionId"
      AND session."ownerId" = auth.uid()::text
  )
);

DROP POLICY IF EXISTS pomodoro_focus_session_members_update_owner_or_self_or_admin ON public."pomodoro_focus_session_members";
CREATE POLICY pomodoro_focus_session_members_update_owner_or_self_or_admin
ON public."pomodoro_focus_session_members"
FOR UPDATE
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public."pomodoro_focus_sessions" AS session
    WHERE session.id = "sessionId"
      AND session."ownerId" = auth.uid()::text
  )
)
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public."pomodoro_focus_sessions" AS session
    WHERE session.id = "sessionId"
      AND session."ownerId" = auth.uid()::text
  )
);

DROP POLICY IF EXISTS pomodoro_focus_session_members_delete_owner_or_self_or_admin ON public."pomodoro_focus_session_members";
CREATE POLICY pomodoro_focus_session_members_delete_owner_or_self_or_admin
ON public."pomodoro_focus_session_members"
FOR DELETE
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public."pomodoro_focus_sessions" AS session
    WHERE session.id = "sessionId"
      AND session."ownerId" = auth.uid()::text
  )
);

DROP POLICY IF EXISTS minigame_leaderboard_entries_select_authenticated ON public."minigame_leaderboard_entries";
CREATE POLICY minigame_leaderboard_entries_select_authenticated
ON public."minigame_leaderboard_entries"
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS minigame_leaderboard_entries_insert_self_or_admin ON public."minigame_leaderboard_entries";
CREATE POLICY minigame_leaderboard_entries_insert_self_or_admin
ON public."minigame_leaderboard_entries"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS minigame_leaderboard_entries_update_self_or_admin ON public."minigame_leaderboard_entries";
CREATE POLICY minigame_leaderboard_entries_update_self_or_admin
ON public."minigame_leaderboard_entries"
FOR UPDATE
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
)
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS minigame_leaderboard_entries_delete_admin_only ON public."minigame_leaderboard_entries";
CREATE POLICY minigame_leaderboard_entries_delete_admin_only
ON public."minigame_leaderboard_entries"
FOR DELETE
TO authenticated
USING (public.is_admin());
