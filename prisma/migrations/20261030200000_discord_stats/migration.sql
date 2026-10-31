-- CreateTable
CREATE TABLE "discord_voice_sessions" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "discord_voice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_message_days" (
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "discord_message_days_pkey" PRIMARY KEY ("discordId","day")
);

-- CreateTable
CREATE TABLE "discord_wordle_streak" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL,
    "postedOn" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_wordle_streak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discord_voice_sessions_discordId_joinedAt_idx" ON "discord_voice_sessions"("discordId", "joinedAt");

-- CreateIndex
CREATE INDEX "discord_voice_sessions_leftAt_idx" ON "discord_voice_sessions"("leftAt");

-- CreateIndex
CREATE INDEX "discord_message_days_day_idx" ON "discord_message_days"("day");
