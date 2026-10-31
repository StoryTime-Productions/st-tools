-- The Discord stats tables hold member names, ids and avatars, so like every other table they must
-- not be readable or writable through the public Supabase API. With row-level security on and no
-- policy, only the server (which connects as the table owner) can touch them.
ALTER TABLE public."discord_voice_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."discord_message_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."discord_wordle_streak" ENABLE ROW LEVEL SECURITY;

-- CreateTable
-- A single row the bot routes touch whenever Discord stats change. The dashboard listens to it over
-- Supabase Realtime and refreshes, so nothing about members reaches the browser.
CREATE TABLE "discord_stats_pulse" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_stats_pulse_pkey" PRIMARY KEY ("id")
);

INSERT INTO "discord_stats_pulse" ("id") VALUES (1);

ALTER TABLE public."discord_stats_pulse" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discord_stats_pulse_select_authenticated ON public."discord_stats_pulse";
CREATE POLICY discord_stats_pulse_select_authenticated
ON public."discord_stats_pulse"
FOR SELECT
TO authenticated
USING (true);

-- Ensure the realtime stream includes the pulse table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."discord_stats_pulse"';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END
$$;
