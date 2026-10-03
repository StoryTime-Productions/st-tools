-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'SENT', 'CONFIRMED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('E_TRANSFER', 'CASH');

-- AlterTable
ALTER TABLE "hangout_stops" ADD COLUMN     "costItemId" TEXT;

-- CreateTable
CREATE TABLE "hangout_costs" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hangoutId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,

    CONSTRAINT "hangout_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hangout_cost_shares" (
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "method" "PaymentMethod",
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "costId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "hangout_cost_shares_pkey" PRIMARY KEY ("costId","userId")
);

-- CreateIndex
CREATE INDEX "hangout_costs_hangoutId_position_idx" ON "hangout_costs"("hangoutId", "position");

-- AddForeignKey
ALTER TABLE "hangout_stops" ADD CONSTRAINT "hangout_stops_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "hangout_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_costs" ADD CONSTRAINT "hangout_costs_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_costs" ADD CONSTRAINT "hangout_costs_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_cost_shares" ADD CONSTRAINT "hangout_cost_shares_costId_fkey" FOREIGN KEY ("costId") REFERENCES "hangout_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_cost_shares" ADD CONSTRAINT "hangout_cost_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

