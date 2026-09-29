-- Each member's free availability slots for a hangout (EST keys like 2026-10-03T10:15).
-- CreateTable
CREATE TABLE "hangout_availability" (
    "slots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_availability_pkey" PRIMARY KEY ("hangoutId","userId")
);

-- AddForeignKey
ALTER TABLE "hangout_availability" ADD CONSTRAINT "hangout_availability_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_availability" ADD CONSTRAINT "hangout_availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
