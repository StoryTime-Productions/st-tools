-- Hangout ideas (slice 2): proposed in Discord, promoted by admins.
-- CreateTable
CREATE TABLE "hangout_ideas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "proposerDiscordId" TEXT NOT NULL,
    "proposerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hangoutId" TEXT,

    CONSTRAINT "hangout_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hangout_ideas_hangoutId_key" ON "hangout_ideas"("hangoutId");

-- AddForeignKey
ALTER TABLE "hangout_ideas" ADD CONSTRAINT "hangout_ideas_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS on with no policies: only Prisma (service role) touches this table.
ALTER TABLE public."hangout_ideas" ENABLE ROW LEVEL SECURITY;
