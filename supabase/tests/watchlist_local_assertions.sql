\set ON_ERROR_STOP on

DO $watchlist_table_security$
BEGIN
  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_class AS c
    WHERE c.oid = 'public.user_watchlist_preferences'::regclass
  ) THEN
    RAISE EXCEPTION 'Watchlist preferences table does not have RLS enabled';
  END IF;

  IF has_table_privilege(
       'anon',
       'public.user_watchlist_preferences',
       'SELECT'
     )
     OR has_table_privilege(
       'anon',
       'public.user_watchlist_preferences',
       'INSERT'
     )
     OR has_table_privilege(
       'anon',
       'public.user_watchlist_preferences',
       'UPDATE'
     )
     OR has_table_privilege(
       'anon',
       'public.user_watchlist_preferences',
       'DELETE'
     ) THEN
    RAISE EXCEPTION 'Anonymous role has access to watchlist preferences';
  END IF;

  IF NOT has_table_privilege(
       'authenticated',
       'public.user_watchlist_preferences',
       'SELECT'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.user_watchlist_preferences',
       'INSERT'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.user_watchlist_preferences',
       'UPDATE'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.user_watchlist_preferences',
       'DELETE'
     ) THEN
    RAISE EXCEPTION 'Authenticated role is missing watchlist CRUD grants';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'user_watchlist_preferences'
  ) <> 4 THEN
    RAISE EXCEPTION 'Expected four operation-specific watchlist policies';
  END IF;

  IF NOT has_column_privilege(
       'authenticated',
       'public.transactions',
       'currency',
       'SELECT'
     ) THEN
    RAISE EXCEPTION 'Authenticated history view cannot read transaction currency';
  END IF;
END;
$watchlist_table_security$;

INSERT INTO auth.users (id, email)
VALUES
  ('80000000-0000-0000-0000-000000000008', 'watchlist-a@example.test'),
  ('90000000-0000-0000-0000-000000000009', 'watchlist-b@example.test');

INSERT INTO public.user_watchlist_preferences
  (user_id, watchlist, price_alerts)
VALUES
  (
    '80000000-0000-0000-0000-000000000008',
    ARRAY['BTC', 'ETH'],
    '[{"id":"alert-a","symbol":"BTC","condition":"above","currency":"USD","threshold":100000,"triggeredAt":null,"triggeredPrice":null}]'
  ),
  (
    '90000000-0000-0000-0000-000000000009',
    ARRAY['SOL'],
    '[]'
  );

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '80000000-0000-0000-0000-000000000008',
  true
);

DO $watchlist_owner_isolation$
DECLARE
  visible_rows integer;
  changed_rows integer;
  rejected_foreign_insert boolean := false;
  rejected_owner_change boolean := false;
BEGIN
  SELECT count(*) INTO visible_rows
  FROM public.user_watchlist_preferences;

  IF visible_rows <> 1 THEN
    RAISE EXCEPTION 'Authenticated user can read another user watchlist';
  END IF;

  UPDATE public.user_watchlist_preferences
  SET watchlist = ARRAY['BTC', 'SOL']
  WHERE user_id = '90000000-0000-0000-0000-000000000009';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Authenticated user modified another user watchlist';
  END IF;

  DELETE FROM public.user_watchlist_preferences
  WHERE user_id = '90000000-0000-0000-0000-000000000009';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Authenticated user deleted another user watchlist';
  END IF;

  BEGIN
    INSERT INTO public.user_watchlist_preferences
      (user_id, watchlist, price_alerts)
    VALUES (
      '90000000-0000-0000-0000-000000000009',
      ARRAY['BTC'],
      '[]'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      rejected_foreign_insert := true;
  END;

  IF NOT rejected_foreign_insert THEN
    RAISE EXCEPTION 'Authenticated user inserted another user watchlist';
  END IF;

  UPDATE public.user_watchlist_preferences
  SET watchlist = ARRAY['BTC', 'SOL']
  WHERE user_id = '80000000-0000-0000-0000-000000000008';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Authenticated user could not update own watchlist';
  END IF;

  BEGIN
    UPDATE public.user_watchlist_preferences
    SET user_id = '90000000-0000-0000-0000-000000000009'
    WHERE user_id = '80000000-0000-0000-0000-000000000008';
  EXCEPTION
    WHEN insufficient_privilege THEN
      rejected_owner_change := true;
  END;

  IF NOT rejected_owner_change THEN
    RAISE EXCEPTION 'Authenticated user changed ownership of own watchlist row';
  END IF;

  INSERT INTO public.user_watchlist_preferences
    (user_id, watchlist, price_alerts)
  VALUES (
    '80000000-0000-0000-0000-000000000008',
    ARRAY['BTC'],
    '[]'
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    watchlist = EXCLUDED.watchlist,
    price_alerts = EXCLUDED.price_alerts;

  DELETE FROM public.user_watchlist_preferences
  WHERE user_id = '80000000-0000-0000-0000-000000000008';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Authenticated user could not delete own watchlist';
  END IF;
END;
$watchlist_owner_isolation$;

ROLLBACK;

SET ROLE anon;
DO $watchlist_anon_denied$
BEGIN
  BEGIN
    PERFORM 1 FROM public.user_watchlist_preferences;
    RAISE EXCEPTION 'Anonymous user unexpectedly read watchlist preferences';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$watchlist_anon_denied$;
RESET ROLE;

SELECT 'Local watchlist RLS and grant assertions passed.' AS result;
