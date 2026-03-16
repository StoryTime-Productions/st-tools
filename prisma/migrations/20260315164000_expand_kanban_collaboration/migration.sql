-- Add collaborative visibility support to boards.
ALTER TABLE public."boards"
ADD COLUMN IF NOT EXISTS "isOpenToWorkspace" BOOLEAN NOT NULL DEFAULT false;

-- Add checklist items for card detail panels.
CREATE TABLE IF NOT EXISTS public."card_checklist_items" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "card_checklist_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_checklist_items_cardId_fkey"
      FOREIGN KEY ("cardId") REFERENCES public."cards"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "card_checklist_items_cardId_idx"
ON public."card_checklist_items"("cardId");

-- Expand board access rules so collaborative boards can be opened to the whole workspace.
CREATE OR REPLACE FUNCTION public.can_access_board(target_board_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public."boards" AS board
      WHERE board.id = target_board_id
        AND board."ownerId" = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1
      FROM public."boards" AS board
      WHERE board.id = target_board_id
        AND board."isPersonal" = false
        AND board."isOpenToWorkspace" = true
    )
    OR EXISTS (
      SELECT 1
      FROM public."board_members" AS membership
      WHERE membership."boardId" = target_board_id
        AND membership."userId" = auth.uid()::text
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_card(target_card_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."cards" AS board_card
    INNER JOIN public."columns" AS board_column
      ON board_column.id = board_card."columnId"
    WHERE board_card.id = target_card_id
      AND public.can_access_board(board_column."boardId")
  );
$$;

ALTER TABLE public."card_checklist_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_checklist_items_select_card_member_or_admin ON public."card_checklist_items";
CREATE POLICY card_checklist_items_select_card_member_or_admin
ON public."card_checklist_items"
FOR SELECT
TO authenticated
USING (public.can_access_card("cardId"));

DROP POLICY IF EXISTS card_checklist_items_insert_card_member_or_admin ON public."card_checklist_items";
CREATE POLICY card_checklist_items_insert_card_member_or_admin
ON public."card_checklist_items"
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_card("cardId"));

DROP POLICY IF EXISTS card_checklist_items_update_card_member_or_admin ON public."card_checklist_items";
CREATE POLICY card_checklist_items_update_card_member_or_admin
ON public."card_checklist_items"
FOR UPDATE
TO authenticated
USING (public.can_access_card("cardId"))
WITH CHECK (public.can_access_card("cardId"));

DROP POLICY IF EXISTS card_checklist_items_delete_card_member_or_admin ON public."card_checklist_items";
CREATE POLICY card_checklist_items_delete_card_member_or_admin
ON public."card_checklist_items"
FOR DELETE
TO authenticated
USING (public.can_access_card("cardId"));
