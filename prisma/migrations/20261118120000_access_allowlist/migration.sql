-- CreateTable
CREATE TABLE "allowed_emails" (
    "email" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_emails_pkey" PRIMARY KEY ("email")
);

-- The anon key is public: with RLS on and no policy only the app's own database role can read the list.
ALTER TABLE "allowed_emails" ENABLE ROW LEVEL SECURITY;

-- Everyone who already has an account stays allowed.
INSERT INTO "allowed_emails" ("email")
SELECT DISTINCT lower(btrim("email")) FROM "users" WHERE "email" IS NOT NULL AND btrim("email") <> ''
ON CONFLICT DO NOTHING;

-- Refuse a new auth account (email, Google, Discord) whose email is not on the list.
CREATE OR REPLACE FUNCTION public.enforce_allowed_email() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.allowed_emails WHERE email = lower(btrim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'email_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_allowed_email() FROM PUBLIC, anon, authenticated;

-- The auth schema only exists on a Supabase database; a plain shadow database (prisma migrate dev) skips this part.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RETURN;
  END IF;

  -- Accounts that exist in auth but not yet in users stay allowed too.
  EXECUTE 'INSERT INTO public.allowed_emails ("email")
           SELECT DISTINCT lower(btrim(email)) FROM auth.users WHERE email IS NOT NULL AND btrim(email) <> ''''
           ON CONFLICT DO NOTHING';

  EXECUTE 'DROP TRIGGER IF EXISTS enforce_allowed_email ON auth.users';
  EXECUTE 'CREATE TRIGGER enforce_allowed_email
             BEFORE INSERT ON auth.users
             FOR EACH ROW EXECUTE FUNCTION public.enforce_allowed_email()';
END;
$$;
