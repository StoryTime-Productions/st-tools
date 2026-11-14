-- CreateEnum
CREATE TYPE "CountdownScope" AS ENUM ('GLOBAL', 'PERSONAL');

-- CreateTable
CREATE TABLE "countdowns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "scope" "CountdownScope" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countdown_audience" (
    "countdownId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "countdown_audience_pkey" PRIMARY KEY ("countdownId","userId")
);

-- CreateTable
CREATE TABLE "countdown_dismissals" (
    "countdownId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countdown_dismissals_pkey" PRIMARY KEY ("countdownId","userId")
);

-- CreateIndex
CREATE INDEX "countdowns_scope_targetAt_idx" ON "countdowns"("scope", "targetAt");

-- CreateIndex
CREATE INDEX "countdowns_ownerId_idx" ON "countdowns"("ownerId");

-- AddForeignKey
ALTER TABLE "countdowns" ADD CONSTRAINT "countdowns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countdown_audience" ADD CONSTRAINT "countdown_audience_countdownId_fkey" FOREIGN KEY ("countdownId") REFERENCES "countdowns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countdown_audience" ADD CONSTRAINT "countdown_audience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countdown_dismissals" ADD CONSTRAINT "countdown_dismissals_countdownId_fkey" FOREIGN KEY ("countdownId") REFERENCES "countdowns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countdown_dismissals" ADD CONSTRAINT "countdown_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Titles and audiences: not readable or writable through the public Supabase API.
ALTER TABLE public."countdowns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."countdown_audience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."countdown_dismissals" ENABLE ROW LEVEL SECURITY;
