-- Ensure the avatars storage bucket exists with stable access policies.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Skipping storage bucket setup because storage schema is unavailable.';
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'avatars',
      'avatars',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO UPDATE
    SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

    EXECUTE 'DROP POLICY IF EXISTS avatars_public_read ON storage.objects';
    EXECUTE 'CREATE POLICY avatars_public_read
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = ''avatars'')';

    EXECUTE 'DROP POLICY IF EXISTS avatars_auth_insert_own_folder ON storage.objects';
    EXECUTE 'CREATE POLICY avatars_auth_insert_own_folder
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = ''avatars''
        AND split_part(name, ''/'', 1) = auth.uid()::text
      )';

    EXECUTE 'DROP POLICY IF EXISTS avatars_auth_update_own_folder ON storage.objects';
    EXECUTE 'CREATE POLICY avatars_auth_update_own_folder
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = ''avatars''
        AND split_part(name, ''/'', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = ''avatars''
        AND split_part(name, ''/'', 1) = auth.uid()::text
      )';

    EXECUTE 'DROP POLICY IF EXISTS avatars_auth_delete_own_folder ON storage.objects';
    EXECUTE 'CREATE POLICY avatars_auth_delete_own_folder
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = ''avatars''
        AND split_part(name, ''/'', 1) = auth.uid()::text
      )';
  END IF;
END $$;
