-- Boards are membership-only: personal boards are deleted, workspace-open
-- boards get every user as a member, and every owner is a member.
DELETE FROM public."boards" WHERE "isPersonal" = true;

INSERT INTO public."board_members" ("id", "boardId", "userId")
SELECT gen_random_uuid()::text, board.id, app_user.id
FROM public."boards" AS board
CROSS JOIN public."users" AS app_user
WHERE board."isOpenToWorkspace" = true
ON CONFLICT ("boardId", "userId") DO NOTHING;

INSERT INTO public."board_members" ("id", "boardId", "userId")
SELECT gen_random_uuid()::text, board.id, board."ownerId"
FROM public."boards" AS board
ON CONFLICT ("boardId", "userId") DO NOTHING;

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
      FROM public."board_members" AS membership
      WHERE membership."boardId" = target_board_id
        AND membership."userId" = auth.uid()::text
    );
$$;

ALTER TABLE public."boards" DROP COLUMN "isPersonal",
DROP COLUMN "isOpenToWorkspace";
