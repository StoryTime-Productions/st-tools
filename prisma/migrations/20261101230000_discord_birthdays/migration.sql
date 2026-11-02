-- CreateTable
-- The server's birthdays, copied from STBot (which owns them). Month and day only, no year.
CREATE TABLE "discord_birthdays" (
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,

    CONSTRAINT "discord_birthdays_pkey" PRIMARY KEY ("discordId")
);

-- Names, ids and avatars: not readable or writable through the public Supabase API.
ALTER TABLE public."discord_birthdays" ENABLE ROW LEVEL SECURITY;
