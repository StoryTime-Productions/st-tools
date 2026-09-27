-- Hangouts (slice 2): admin-created social events.
-- CreateEnum
CREATE TYPE "HangoutStatus" AS ENUM ('COLLECTING', 'SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "hangouts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "discordThreadUrl" TEXT,
    "status" "HangoutStatus" NOT NULL DEFAULT 'COLLECTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hangouts_pkey" PRIMARY KEY ("id")
);

-- RLS on with no policies: only Prisma (service role) touches this table.
ALTER TABLE public."hangouts" ENABLE ROW LEVEL SECURITY;
