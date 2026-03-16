-- Add compact card activity history with retention-friendly indexing.
DO $$
BEGIN
  CREATE TYPE public."CardActivityEvent" AS ENUM ('CREATED', 'UPDATED', 'MOVED');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."card_activities" (
  "id" TEXT NOT NULL,
  "eventType" public."CardActivityEvent" NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cardId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "actorUserId" TEXT,

  CONSTRAINT "card_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "card_activities_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES public."cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "card_activities_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."boards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "card_activities_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES public."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "card_activities_cardId_createdAt_idx"
ON public."card_activities"("cardId", "createdAt");

CREATE INDEX IF NOT EXISTS "card_activities_boardId_createdAt_idx"
ON public."card_activities"("boardId", "createdAt");

ALTER TABLE public."card_activities" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_activities_select_card_member_or_admin ON public."card_activities";
CREATE POLICY card_activities_select_card_member_or_admin
ON public."card_activities"
FOR SELECT
TO authenticated
USING (public.can_access_card("cardId"));

-- Ensure realtime streams include board and card change tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."columns"';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."cards"';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."card_activities"';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END $$;
