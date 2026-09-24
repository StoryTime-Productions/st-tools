-- Dev-only logins, password: test1234. Ids must match devUsers in prisma/seed.ts.
with dev_users(id, email, name) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'alice@storytime.gg', 'Alice'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'bob@storytime.gg', 'Bob'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'carol@storytime.gg', 'Carol'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'test1@storytime.gg', 'Test User 1'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'test2@storytime.gg', 'Test User 2')
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('test1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name),
    now(), now(), '', '', '', ''
  from dev_users
  on conflict (id) do nothing
  returning id, email
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), id::text, id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from new_users;
