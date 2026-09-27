-- Card labels become one shared, admin-created tag list.
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_CardToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CardToTag_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

CREATE INDEX "_CardToTag_B_index" ON "_CardToTag"("B");

ALTER TABLE "_CardToTag" ADD CONSTRAINT "_CardToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_CardToTag" ADD CONSTRAINT "_CardToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing free-text labels become tags, kept exactly as written (trimmed).
INSERT INTO "tags" ("id", "name")
SELECT gen_random_uuid()::text, label_name
FROM (
  SELECT DISTINCT btrim(label) AS label_name
  FROM "cards", unnest("labels") AS label
) AS distinct_labels
WHERE label_name <> '';

INSERT INTO "_CardToTag" ("A", "B")
SELECT DISTINCT card.id, tag.id
FROM "cards" AS card
CROSS JOIN LATERAL unnest(card."labels") AS label
INNER JOIN "tags" AS tag ON tag.name = btrim(label);

ALTER TABLE "cards" DROP COLUMN "labels";

ALTER TABLE public."tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_CardToTag" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_select_authenticated
ON public."tags"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY tags_insert_admin
ON public."tags"
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY tags_update_admin
ON public."tags"
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY tags_delete_admin
ON public."tags"
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY card_tags_select_card_member_or_admin
ON public."_CardToTag"
FOR SELECT
TO authenticated
USING (public.can_access_card("A"));

CREATE POLICY card_tags_insert_card_member_or_admin
ON public."_CardToTag"
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_card("A"));

CREATE POLICY card_tags_delete_card_member_or_admin
ON public."_CardToTag"
FOR DELETE
TO authenticated
USING (public.can_access_card("A"));
