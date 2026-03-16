-- Enable row level security on Prisma-managed tables exposed through Supabase.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."users"
    WHERE id = auth.uid()::text
      AND "role" = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_role(target_user_id text)
RETURNS public."Role"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "role"
  FROM public."users"
  WHERE id = target_user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_email(target_user_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public."users"
  WHERE id = target_user_id;
$$;

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

CREATE OR REPLACE FUNCTION public.can_administer_board(target_board_id text)
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
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_column(target_column_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."columns" AS board_column
    WHERE board_column.id = target_column_id
      AND public.can_access_board(board_column."boardId")
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_page(page_author_id text, page_is_personal boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR page_author_id = auth.uid()::text
    OR NOT page_is_personal;
$$;

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."boards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."board_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."columns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pomodoro_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pages" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_self_or_admin ON public."users";
CREATE POLICY users_select_self_or_admin
ON public."users"
FOR SELECT
TO authenticated
USING (
  id = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS users_insert_self_or_admin ON public."users";
CREATE POLICY users_insert_self_or_admin
ON public."users"
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    id = auth.uid()::text
    AND "role" = 'MEMBER'
    AND email = auth.jwt() ->> 'email'
  )
);

DROP POLICY IF EXISTS users_update_self_or_admin ON public."users";
CREATE POLICY users_update_self_or_admin
ON public."users"
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()::text
  OR public.is_admin()
)
WITH CHECK (
  public.is_admin()
  OR (
    id = auth.uid()::text
    AND "role" = public.user_role(auth.uid()::text)
    AND email = public.user_email(auth.uid()::text)
  )
);

DROP POLICY IF EXISTS users_delete_self_or_admin ON public."users";
CREATE POLICY users_delete_self_or_admin
ON public."users"
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);

DROP POLICY IF EXISTS boards_select_member_or_admin ON public."boards";
CREATE POLICY boards_select_member_or_admin
ON public."boards"
FOR SELECT
TO authenticated
USING (public.can_access_board(id));

DROP POLICY IF EXISTS boards_insert_owner_or_admin ON public."boards";
CREATE POLICY boards_insert_owner_or_admin
ON public."boards"
FOR INSERT
TO authenticated
WITH CHECK (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS boards_update_owner_or_admin ON public."boards";
CREATE POLICY boards_update_owner_or_admin
ON public."boards"
FOR UPDATE
TO authenticated
USING (
  public.can_administer_board(id)
)
WITH CHECK (
  "ownerId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS boards_delete_owner_or_admin ON public."boards";
CREATE POLICY boards_delete_owner_or_admin
ON public."boards"
FOR DELETE
TO authenticated
USING (public.can_administer_board(id));

DROP POLICY IF EXISTS board_members_select_member_or_admin ON public."board_members";
CREATE POLICY board_members_select_member_or_admin
ON public."board_members"
FOR SELECT
TO authenticated
USING (public.can_access_board("boardId"));

DROP POLICY IF EXISTS board_members_insert_owner_or_admin ON public."board_members";
CREATE POLICY board_members_insert_owner_or_admin
ON public."board_members"
FOR INSERT
TO authenticated
WITH CHECK (public.can_administer_board("boardId"));

DROP POLICY IF EXISTS board_members_delete_owner_or_admin ON public."board_members";
CREATE POLICY board_members_delete_owner_or_admin
ON public."board_members"
FOR DELETE
TO authenticated
USING (public.can_administer_board("boardId"));

DROP POLICY IF EXISTS columns_select_board_member_or_admin ON public."columns";
CREATE POLICY columns_select_board_member_or_admin
ON public."columns"
FOR SELECT
TO authenticated
USING (public.can_access_board("boardId"));

DROP POLICY IF EXISTS columns_insert_board_member_or_admin ON public."columns";
CREATE POLICY columns_insert_board_member_or_admin
ON public."columns"
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_board("boardId"));

DROP POLICY IF EXISTS columns_update_board_member_or_admin ON public."columns";
CREATE POLICY columns_update_board_member_or_admin
ON public."columns"
FOR UPDATE
TO authenticated
USING (public.can_access_board("boardId"))
WITH CHECK (public.can_access_board("boardId"));

DROP POLICY IF EXISTS columns_delete_board_member_or_admin ON public."columns";
CREATE POLICY columns_delete_board_member_or_admin
ON public."columns"
FOR DELETE
TO authenticated
USING (public.can_access_board("boardId"));

DROP POLICY IF EXISTS cards_select_board_member_or_admin ON public."cards";
CREATE POLICY cards_select_board_member_or_admin
ON public."cards"
FOR SELECT
TO authenticated
USING (public.can_access_column("columnId"));

DROP POLICY IF EXISTS cards_insert_board_member_or_admin ON public."cards";
CREATE POLICY cards_insert_board_member_or_admin
ON public."cards"
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_column("columnId"));

DROP POLICY IF EXISTS cards_update_board_member_or_admin ON public."cards";
CREATE POLICY cards_update_board_member_or_admin
ON public."cards"
FOR UPDATE
TO authenticated
USING (public.can_access_column("columnId"))
WITH CHECK (public.can_access_column("columnId"));

DROP POLICY IF EXISTS cards_delete_board_member_or_admin ON public."cards";
CREATE POLICY cards_delete_board_member_or_admin
ON public."cards"
FOR DELETE
TO authenticated
USING (public.can_access_column("columnId"));

DROP POLICY IF EXISTS pomodoro_sessions_select_self_or_admin ON public."pomodoro_sessions";
CREATE POLICY pomodoro_sessions_select_self_or_admin
ON public."pomodoro_sessions"
FOR SELECT
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_sessions_insert_self_or_admin ON public."pomodoro_sessions";
CREATE POLICY pomodoro_sessions_insert_self_or_admin
ON public."pomodoro_sessions"
FOR INSERT
TO authenticated
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_sessions_update_self_or_admin ON public."pomodoro_sessions";
CREATE POLICY pomodoro_sessions_update_self_or_admin
ON public."pomodoro_sessions"
FOR UPDATE
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
)
WITH CHECK (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pomodoro_sessions_delete_self_or_admin ON public."pomodoro_sessions";
CREATE POLICY pomodoro_sessions_delete_self_or_admin
ON public."pomodoro_sessions"
FOR DELETE
TO authenticated
USING (
  "userId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pages_select_visible_or_owner_or_admin ON public."pages";
CREATE POLICY pages_select_visible_or_owner_or_admin
ON public."pages"
FOR SELECT
TO authenticated
USING (public.can_access_page("authorId", "isPersonal"));

DROP POLICY IF EXISTS pages_insert_owner_or_admin ON public."pages";
CREATE POLICY pages_insert_owner_or_admin
ON public."pages"
FOR INSERT
TO authenticated
WITH CHECK (
  "authorId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pages_update_owner_or_admin ON public."pages";
CREATE POLICY pages_update_owner_or_admin
ON public."pages"
FOR UPDATE
TO authenticated
USING (
  "authorId" = auth.uid()::text
  OR public.is_admin()
)
WITH CHECK (
  "authorId" = auth.uid()::text
  OR public.is_admin()
);

DROP POLICY IF EXISTS pages_delete_owner_or_admin ON public."pages";
CREATE POLICY pages_delete_owner_or_admin
ON public."pages"
FOR DELETE
TO authenticated
USING (
  "authorId" = auth.uid()::text
  OR public.is_admin()
);