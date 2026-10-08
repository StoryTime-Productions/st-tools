-- CreateTable
CREATE TABLE "hangout_cost_participants" (
    "costId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_cost_participants_pkey" PRIMARY KEY ("costId","userId")
);

-- CreateIndex
CREATE INDEX "hangout_cost_participants_userId_idx" ON "hangout_cost_participants"("userId");

-- AddForeignKey
ALTER TABLE "hangout_cost_participants" ADD CONSTRAINT "hangout_cost_participants_costId_fkey" FOREIGN KEY ("costId") REFERENCES "hangout_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_cost_participants" ADD CONSTRAINT "hangout_cost_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing items keep today's behaviour: their group is everyone Going plus anyone who already has a share.
INSERT INTO "hangout_cost_participants" ("costId", "userId")
SELECT c."id", a."userId"
FROM "hangout_costs" c
JOIN "hangout_attendees" a ON a."hangoutId" = c."hangoutId" AND a."status" = 'GOING'
UNION
SELECT "costId", "userId" FROM "hangout_cost_shares";
