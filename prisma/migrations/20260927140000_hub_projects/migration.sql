-- Hub: initiatives group projects; projects own phases, links, tags and boards.
-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "initiatives" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "startQuarter" TEXT,
    "endQuarter" TEXT,
    "currentPhaseIndex" INTEGER,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "initiativeId" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_phases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_links" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "project_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "initiatives_name_key" ON "initiatives"("name");

-- CreateIndex
CREATE INDEX "projects_initiativeId_idx" ON "projects"("initiativeId");

-- CreateIndex
CREATE INDEX "project_phases_projectId_idx" ON "project_phases"("projectId");

-- CreateIndex
CREATE INDEX "project_links_projectId_idx" ON "project_links"("projectId");

-- CreateIndex
CREATE INDEX "_ProjectToTag_B_index" ON "_ProjectToTag"("B");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectToTag" ADD CONSTRAINT "_ProjectToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectToTag" ADD CONSTRAINT "_ProjectToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "boards_projectId_idx" ON "boards"("projectId");

ALTER TABLE public."initiatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_ProjectToTag" ENABLE ROW LEVEL SECURITY;

CREATE POLICY initiatives_select_authenticated
ON public."initiatives"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY initiatives_write_admin
ON public."initiatives"
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY projects_select_authenticated
ON public."projects"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY projects_write_admin
ON public."projects"
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY project_phases_select_authenticated
ON public."project_phases"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY project_phases_write_admin
ON public."project_phases"
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY project_links_select_authenticated
ON public."project_links"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY project_links_write_admin
ON public."project_links"
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY project_tags_select_authenticated
ON public."_ProjectToTag"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY project_tags_write_admin
ON public."_ProjectToTag"
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
