-- Discord account linked through Supabase identity linking; used to DM admins.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "discordId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");
