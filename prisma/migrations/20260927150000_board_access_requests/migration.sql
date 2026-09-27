-- Pending requests to join a board; approve adds a member, decline deletes the row.
-- CreateTable
CREATE TABLE "board_access_requests" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_access_requests_boardId_userId_key" ON "board_access_requests"("boardId", "userId");

-- AddForeignKey
ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."board_access_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_access_requests_select_own_or_admin
ON public."board_access_requests"
FOR SELECT
TO authenticated
USING (public.is_admin() OR "userId" = auth.uid()::text);

CREATE POLICY board_access_requests_insert_own
ON public."board_access_requests"
FOR INSERT
TO authenticated
WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY board_access_requests_delete_admin
ON public."board_access_requests"
FOR DELETE
TO authenticated
USING (public.is_admin());
