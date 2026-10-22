BEGIN;

-- Verify that the existing owner-read policies still match the inspected
-- configuration. These policies are retained, not replaced.
DO $preflight_policies$
DECLARE
  expected_table text;
  policy_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    RAISE EXCEPTION
      'Unexpected policy on public.profiles; inspect before applying';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname <> 'transactions_select_own'
  ) THEN
    RAISE EXCEPTION
      'Unexpected policy on public.transactions; inspect before applying';
  END IF;

  FOREACH expected_table IN ARRAY ARRAY[
    'wallet_balances',
    'ledger_entries',
    'notifications'
  ]
  LOOP
    SELECT count(*)
      INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = expected_table;

    IF policy_count <> 1 OR NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = expected_table
        AND cmd = 'SELECT'
        AND permissive = 'PERMISSIVE'
        AND cardinality(roles) = 1
        AND roles @> ARRAY['authenticated']::name[]
        AND with_check IS NULL
        AND regexp_replace(
              lower(coalesce(qual, '')),
              '[[:space:]()]',
              '',
              'g'
            ) IN (
              'user_id=uid',
              'user_id=auth.uid',
              'user_id=selectuidasuid',
              'user_id=selectauth.uidasuid'
            )
        AND EXISTS (
          SELECT 1
          FROM pg_policy AS policy_catalog
          WHERE policy_catalog.polrelid =
              to_regclass(format('public.%I', expected_table))
            AND policy_catalog.polname = pg_policies.policyname
            AND (
              SELECT count(*)
              FROM pg_depend AS policy_dependency
              WHERE policy_dependency.classid = 'pg_policy'::regclass
                AND policy_dependency.objid = policy_catalog.oid
                AND policy_dependency.refclassid = 'pg_proc'::regclass
            ) = 1
            AND EXISTS (
              SELECT 1
              FROM pg_depend AS policy_dependency
              WHERE policy_dependency.classid = 'pg_policy'::regclass
                AND policy_dependency.objid = policy_catalog.oid
                AND policy_dependency.refclassid = 'pg_proc'::regclass
                AND policy_dependency.refobjid =
                    to_regprocedure('auth.uid()')
            )
        )
    ) THEN
      RAISE EXCEPTION
        'Expected exactly one authenticated owner SELECT policy on public.%; inspect before applying',
        expected_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'wallet_balances',
      'ledger_entries',
      'notifications'
    ]) AS expected(table_name)
    LEFT JOIN pg_class AS c
      ON c.oid = to_regclass(format('public.%I', expected.table_name))
    WHERE c.oid IS NULL
       OR NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'A wallet, ledger, or notification table is missing or RLS is disabled';
  END IF;
END;
$preflight_policies$;

-- Existing auth.users triggers are expected to invoke these SECURITY
-- DEFINER functions. Revoking client EXECUTE does not detach the triggers.
DO $preflight_triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    WHERE t.tgrelid = to_regclass('auth.users')
      AND t.tgname = 'on_auth_user_created'
      AND t.tgfoid = to_regprocedure('public.handle_new_user()')
      AND t.tgenabled IN ('O', 'A')
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'Expected enabled auth.users trigger on_auth_user_created was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    WHERE t.tgrelid = to_regclass('auth.users')
      AND t.tgname = 'initialize_demo_wallets_on_signup'
      AND t.tgfoid = to_regprocedure('public.initialize_demo_wallets()')
      AND t.tgenabled IN ('O', 'A')
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'Expected enabled auth.users trigger initialize_demo_wallets_on_signup was not found';
  END IF;
END;
$preflight_triggers$;

-- Confirm that each function expected to write protected tables is a
-- SECURITY DEFINER function whose postgres owner bypasses RLS.
DO $preflight_definers$
DECLARE
  dependency record;
BEGIN
  FOR dependency IN
    SELECT
      d.function_signature,
      d.table_name,
      p.oid AS function_oid,
      p.prosecdef AS security_definer,
      owner_role.rolname AS function_owner,
      owner_role.rolsuper AS owner_is_superuser,
      owner_role.rolbypassrls AS owner_bypasses_rls,
      target_table.oid AS table_oid
    FROM (
      VALUES
        ('public.handle_new_user()', 'profiles'),
        ('public.initialize_demo_wallets()', 'wallet_balances'),
        ('public.transfer_demo_asset(text,text,numeric)', 'wallet_balances'),
        ('public.transfer_demo_asset(text,text,numeric)', 'ledger_entries'),
        ('public.transfer_demo_asset(text,text,numeric)', 'transactions'),
        ('public.transfer_demo_asset(text,text,numeric)', 'notifications'),
        ('public.admin_credit_demo_asset(uuid,text,numeric)', 'wallet_balances'),
        ('public.admin_credit_demo_asset(uuid,text,numeric)', 'ledger_entries'),
        ('public.admin_credit_demo_asset(uuid,text,numeric)', 'transactions'),
        ('public.admin_credit_demo_asset(uuid,text,numeric)', 'notifications')
    ) AS d(function_signature, table_name)
    LEFT JOIN pg_proc AS p
      ON p.oid = to_regprocedure(d.function_signature)
    LEFT JOIN pg_roles AS owner_role
      ON owner_role.oid = p.proowner
    LEFT JOIN pg_class AS target_table
      ON target_table.oid = to_regclass(format('public.%I', d.table_name))
  LOOP
    IF dependency.function_oid IS NULL
       OR dependency.table_oid IS NULL
       OR dependency.security_definer IS DISTINCT FROM true
       OR dependency.function_owner IS DISTINCT FROM 'postgres'
       OR NOT coalesce(
         dependency.owner_is_superuser
         OR dependency.owner_bypasses_rls,
         false
       ) THEN
      RAISE EXCEPTION
        'Cannot confirm SECURITY DEFINER RLS bypass for % on public.%; inspect function owner and RLS settings',
        dependency.function_signature,
        dependency.table_name;
    END IF;
  END LOOP;
END;
$preflight_definers$;

-- Remove explicit client column privileges before removing table privileges.
DO $revoke_column_grants$
DECLARE
  column_row record;
BEGIN
  FOR column_row IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'profiles',
        'transactions',
        'wallet_balances',
        'ledger_entries',
        'notifications'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      column_row.column_name,
      column_row.table_name
    );
  END LOOP;
END;
$revoke_column_grants$;

-- Revoke client table grants, including TRUNCATE and direct writes.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.transactions,
  public.wallet_balances,
  public.ledger_entries,
  public.notifications
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Replace only the named owner-read policy. The preflight rejects any other
-- transactions policies that could broaden access.
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Restore only the authenticated reads needed by the app and existing ledger
-- read feature. RLS remains the row-level authorization boundary.
GRANT SELECT (user_id, id, type, amount, currency, status, created_at)
  ON TABLE public.transactions
  TO authenticated;

GRANT SELECT (user_id, id, title, message, created_at)
  ON TABLE public.notifications
  TO authenticated;

GRANT SELECT (user_id, asset, balance, updated_at)
  ON TABLE public.wallet_balances
  TO authenticated;

GRANT SELECT (
  id,
  user_id,
  asset,
  amount,
  entry_type,
  related_user_id,
  created_at
)
  ON TABLE public.ledger_entries
  TO authenticated;

-- Pin SECURITY DEFINER search paths. These functions were reported to
-- already use empty search_path except for handle_new_user().
ALTER FUNCTION public.handle_new_user()
  SET search_path = '';

ALTER FUNCTION public.initialize_demo_wallets()
  SET search_path = '';

ALTER FUNCTION public.transfer_demo_asset(text, text, numeric)
  SET search_path = '';

ALTER FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
  SET search_path = '';

-- Existing trigger invocation continues; direct client RPC execution is
-- unnecessary and is revoked.
REVOKE ALL PRIVILEGES ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.initialize_demo_wallets()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.transfer_demo_asset(text, text, numeric)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.transfer_demo_asset(text, text, numeric)
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
  TO authenticated;

-- Check effective privileges so inherited grants through role membership do
-- not silently leave a client write path behind.
DO $postflight_table_privileges$
DECLARE
  table_row record;
  role_row record;
  column_row record;
  privilege_name text;
  relation_name text;
  allowed_select boolean;
BEGIN
  FOR table_row IN
    SELECT unnest(ARRAY[
      'profiles',
      'transactions',
      'wallet_balances',
      'ledger_entries',
      'notifications'
    ]) AS table_name
  LOOP
    relation_name := format('%I.%I', 'public', table_row.table_name);

    FOR role_row IN
      SELECT unnest(ARRAY['anon', 'authenticated']::name[]) AS role_name
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]
      LOOP
        IF has_table_privilege(
          role_row.role_name,
          relation_name,
          privilege_name
        ) THEN
          RAISE EXCEPTION
            'Client role % still has table privilege % on %',
            role_row.role_name,
            privilege_name,
            relation_name;
        END IF;
      END LOOP;

      FOR column_row IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = table_row.table_name
      LOOP
        FOREACH privilege_name IN ARRAY ARRAY[
          'INSERT',
          'UPDATE',
          'REFERENCES'
        ]
        LOOP
          IF has_column_privilege(
            role_row.role_name,
            relation_name,
            column_row.column_name,
            privilege_name
          ) THEN
            RAISE EXCEPTION
              'Client role % still has column privilege % on %.%',
              role_row.role_name,
              privilege_name,
              relation_name,
              column_row.column_name;
          END IF;
        END LOOP;

        allowed_select :=
          role_row.role_name = 'authenticated'
          AND (
            table_row.table_name = 'ledger_entries'
            OR (
              table_row.table_name = 'transactions'
              AND column_row.column_name = ANY (
                ARRAY[
                  'user_id',
                  'id',
                  'type',
                  'amount',
                  'currency',
                  'status',
                  'created_at'
                ]
              )
            )
            OR (
              table_row.table_name = 'wallet_balances'
              AND column_row.column_name = ANY (
                ARRAY['user_id', 'asset', 'balance', 'updated_at']
              )
            )
            OR (
              table_row.table_name = 'notifications'
              AND column_row.column_name = ANY (
                ARRAY['user_id', 'id', 'title', 'message', 'created_at']
              )
            )
          );

        IF has_column_privilege(
          role_row.role_name,
          relation_name,
          column_row.column_name,
          'SELECT'
        ) AND NOT allowed_select THEN
          RAISE EXCEPTION
            'Client role % still has unexpected SELECT on %.%',
            role_row.role_name,
            relation_name,
            column_row.column_name;
        END IF;

        IF allowed_select
           AND NOT has_column_privilege(
             role_row.role_name,
             relation_name,
             column_row.column_name,
             'SELECT'
           ) THEN
          RAISE EXCEPTION
            'Required SELECT privilege is missing for role % on %.%',
            role_row.role_name,
            relation_name,
            column_row.column_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$postflight_table_privileges$;

DO $postflight_function_privileges$
BEGIN
  IF has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.initialize_demo_wallets()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.initialize_demo_wallets()', 'EXECUTE') THEN
    RAISE EXCEPTION
      'A client role can still execute a signup trigger function directly';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'Unexpected effective EXECUTE privileges on transfer/admin RPCs';
  END IF;
END;
$postflight_function_privileges$;

COMMIT;
