-- Lock-in: the chosen EST slot key on hangouts, and each member's Going / Maybe / Not going.
-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING');

-- AlterTable
ALTER TABLE "hangouts" ADD COLUMN     "startSlot" TEXT;

-- CreateTable
CREATE TABLE "hangout_attendees" (
    "status" "AttendanceStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_attendees_pkey" PRIMARY KEY ("hangoutId","userId")
);

-- AddForeignKey
ALTER TABLE "hangout_attendees" ADD CONSTRAINT "hangout_attendees_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_attendees" ADD CONSTRAINT "hangout_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

