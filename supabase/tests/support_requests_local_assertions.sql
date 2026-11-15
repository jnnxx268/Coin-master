\set ON_ERROR_STOP on

DO $support_request_privileges$
BEGIN
  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_class AS c
    WHERE c.oid = 'public.support_requests'::regclass
  ) THEN
    RAISE EXCEPTION 'Support requests do not have row-level security enabled';
  END IF;

  IF has_table_privilege('anon', 'public.support_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.support_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.support_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.support_requests', 'DELETE') THEN
    RAISE EXCEPTION 'Anonymous role has support request access';
  END IF;

  IF NOT has_column_privilege(
       'authenticated',
       'public.support_requests',
       'id',
       'SELECT'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.support_requests',
       'user_id',
       'INSERT'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.support_requests',
       'subject',
       'INSERT'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.support_requests',
       'category',
       'INSERT'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.support_requests',
       'message',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.support_requests',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.support_requests',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.support_requests',
       'DELETE'
     ) THEN
    RAISE EXCEPTION 'Authenticated support request grants are not least-privilege';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_requests'
  ) <> 2 THEN
    RAISE EXCEPTION 'Expected owner-scoped select and insert policies';
  END IF;
END;
$support_request_privileges$;

INSERT INTO auth.users (id, email)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'support-a@example.test'),
  ('b2000000-0000-0000-0000-000000000002', 'support-b@example.test');

INSERT INTO public.support_requests (user_id, subject, category, message)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'Account question',
    'account',
    'Question for account A'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'Wallet question',
    'wallet',
    'Question for account B'
  );

BEGIN;
SET LOCAL request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

DO $support_request_rls$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count
  FROM public.support_requests;

  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'User can read another account support request';
  END IF;

  INSERT INTO public.support_requests (user_id, subject, category, message)
  VALUES (
    auth.uid(),
    'Follow-up',
    'other',
    'A second request from account A'
  );

  BEGIN
    INSERT INTO public.support_requests (user_id, subject, category, message)
    VALUES (
      'b2000000-0000-0000-0000-000000000002',
      'Unauthorized',
      'other',
      'This request must be rejected'
    );
    RAISE EXCEPTION 'User inserted a request for another account';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$support_request_rls$;

ROLLBACK;

\echo Local support request RLS and least-privilege assertions passed.
