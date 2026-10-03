-- AlterTable
ALTER TABLE "hangouts" ADD COLUMN     "discordThreadId" TEXT,
ADD COLUMN     "discordMessageId" TEXT;

-- AlterTable
ALTER TABLE "hangout_cost_shares" ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hangout_notifications" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hangoutId" TEXT NOT NULL,

    CONSTRAINT "hangout_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hangout_pending_updates" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hangoutId" TEXT NOT NULL,

    CONSTRAINT "hangout_pending_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hangout_notifications_hangoutId_kind_key_key" ON "hangout_notifications"("hangoutId", "kind", "key");

-- CreateIndex
CREATE INDEX "hangout_pending_updates_hangoutId_createdAt_idx" ON "hangout_pending_updates"("hangoutId", "createdAt");

-- AddForeignKey
ALTER TABLE "hangout_notifications" ADD CONSTRAINT "hangout_notifications_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_pending_updates" ADD CONSTRAINT "hangout_pending_updates_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
