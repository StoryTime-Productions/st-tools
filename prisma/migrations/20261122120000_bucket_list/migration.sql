-- CreateEnum
CREATE TYPE "BucketStatus" AS ENUM ('TODO', 'IN_PLAN', 'DONE');

-- CreateEnum
CREATE TYPE "BucketSeason" AS ENUM ('SPRING', 'SUMMER', 'FALL', 'WINTER');

-- CreateTable
CREATE TABLE "bucket_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "BucketStatus" NOT NULL DEFAULT 'TODO',
    "season" "BucketSeason",
    "seasonYear" INTEGER,
    "driveFolderId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suggestedById" TEXT,
    "hangoutId" TEXT,

    CONSTRAINT "bucket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BucketItemToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BucketItemToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "bucket_items_hangoutId_key" ON "bucket_items"("hangoutId");

-- CreateIndex
CREATE INDEX "bucket_items_status_idx" ON "bucket_items"("status");

-- CreateIndex
CREATE INDEX "bucket_items_suggestedById_idx" ON "bucket_items"("suggestedById");

-- CreateIndex
CREATE INDEX "_BucketItemToTag_B_index" ON "_BucketItemToTag"("B");

-- AddForeignKey
ALTER TABLE "bucket_items" ADD CONSTRAINT "bucket_items_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_items" ADD CONSTRAINT "bucket_items_hangoutId_fkey" FOREIGN KEY ("hangoutId") REFERENCES "hangouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BucketItemToTag" ADD CONSTRAINT "_BucketItemToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "bucket_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BucketItemToTag" ADD CONSTRAINT "_BucketItemToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Bucket list: not readable or writable through the public Supabase API.
ALTER TABLE public."bucket_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_BucketItemToTag" ENABLE ROW LEVEL SECURITY;
