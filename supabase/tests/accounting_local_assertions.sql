\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'sender@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'recipient@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'reciprocal-a@example.test'),
  ('50000000-0000-0000-0000-000000000005', 'reciprocal-b@example.test'),
  ('60000000-0000-0000-0000-000000000006', 'overspend-sender@example.test'),
  ('70000000-0000-0000-0000-000000000007', 'overspend-recipient@example.test');

DO $assert_signup_triggers$
BEGIN
  IF (SELECT count(*) FROM public.profiles
      WHERE id IN (
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000003',
        '40000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000005',
        '60000000-0000-0000-0000-000000000006',
        '70000000-0000-0000-0000-000000000007'
      )) <> 7
     OR (SELECT count(*) FROM public.wallet_balances
         WHERE user_id IN (
           '10000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003',
           '40000000-0000-0000-0000-000000000004',
           '50000000-0000-0000-0000-000000000005',
           '60000000-0000-0000-0000-000000000006',
           '70000000-0000-0000-0000-000000000007'
         )) <> 49 THEN
    RAISE EXCEPTION 'Signup triggers did not create profile and wallet rows';
  END IF;
END;
$assert_signup_triggers$;

INSERT INTO public.wallet_balances (user_id, asset, balance) VALUES
  ('20000000-0000-0000-0000-000000000002', 'BTC', 10),
  ('40000000-0000-0000-0000-000000000004', 'USDT', 10),
  ('50000000-0000-0000-0000-000000000005', 'USDT', 10),
  ('60000000-0000-0000-0000-000000000006', 'ETH', 10),
  ('70000000-0000-0000-0000-000000000007', 'ETH', 0)
ON CONFLICT (user_id, asset)
DO UPDATE SET balance = EXCLUDED.balance;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"admin":"true"}}',
  true
);
SELECT public.admin_credit_demo_asset(
  '30000000-0000-0000-0000-000000000003',
  'BTC',
  2,
  'a0000000-0000-0000-0000-000000000001'
);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"admin":"true"}}',
  true
);
SELECT public.admin_credit_demo_asset(
  '30000000-0000-0000-0000-000000000003',
  'BTC',
  2,
  'a0000000-0000-0000-0000-000000000001'
);
COMMIT;

DO $assert_admin_credit$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '30000000-0000-0000-0000-000000000003'
        AND asset = 'BTC') <> 2
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND entry_type = 'admin_credit') <> 1
     OR (SELECT count(*) FROM public.transactions
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND type = 'admin_credit') <> 1
     OR (SELECT count(*) FROM public.notifications
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND title = 'Balance credited') <> 1 THEN
    RAISE EXCEPTION 'Admin credit and duplicate replay were not atomic/idempotent';
  END IF;
END;
$assert_admin_credit$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"admin":"true"}}',
  true
);
DO $assert_admin_recipient_lookup$
DECLARE
  recipient jsonb;
BEGIN
  recipient := public.admin_resolve_demo_asset_recipient(
    'RECIPIENT@example.test',
    'email'
  );
  IF recipient ->> 'user_id' <>
       '30000000-0000-0000-0000-000000000003'
     OR recipient ->> 'email' <> 'recipient@example.test' THEN
    RAISE EXCEPTION 'Admin email lookup returned the wrong recipient';
  END IF;

  recipient := public.admin_resolve_demo_asset_recipient(
    '30000000-0000-0000-0000-000000000003',
    'user_id'
  );
  IF recipient ->> 'user_id' <>
       '30000000-0000-0000-0000-000000000003'
     OR recipient ->> 'email' <> 'recipient@example.test' THEN
    RAISE EXCEPTION 'Admin User ID lookup returned the wrong recipient';
  END IF;
END;
$assert_admin_recipient_lookup$;

DO $assert_admin_recipient_lookup_validation$
DECLARE
  not_found boolean := false;
  invalid_uuid boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_resolve_demo_asset_recipient(
      'missing@example.test',
      'email'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    not_found := SQLERRM = 'Recipient account not found.';
  END;

  BEGIN
    PERFORM public.admin_resolve_demo_asset_recipient(
      'not-a-uuid',
      'user_id'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    invalid_uuid := SQLERRM = 'Enter a valid Supabase User ID.';
  END;

  IF NOT not_found OR NOT invalid_uuid THEN
    RAISE EXCEPTION 'Admin recipient lookup validation did not reject invalid input';
  END IF;
END;
$assert_admin_recipient_lookup_validation$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"admin":"false"}}',
  true
);
DO $assert_non_admin_rejected$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_credit_demo_asset(
      '30000000-0000-0000-0000-000000000003',
      'BTC',
      100,
      'a0000000-0000-0000-0000-000000000002'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := SQLERRM = 'Admin access required.';
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Non-admin credit was not rejected by the admin claim check';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.admin_resolve_demo_asset_recipient(
      'recipient@example.test',
      'email'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := SQLERRM = 'Admin access required.';
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Non-admin recipient lookup was not rejected';
  END IF;
END;
$assert_non_admin_rejected$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"admin":"true"}}',
  true
);
DO $assert_credit_payload_mismatch$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_credit_demo_asset(
      '30000000-0000-0000-0000-000000000003',
      'BTC',
      3,
      'a0000000-0000-0000-0000-000000000001'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := SQLERRM =
      'Request ID was already used with a different operation or payload.';
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Credit request key accepted a different payload';
  END IF;
END;
$assert_credit_payload_mismatch$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"admin":"false"}}',
  true
);
SELECT public.transfer_demo_asset(
  'recipient@example.test',
  'BTC',
  3,
  'b0000000-0000-0000-0000-000000000001'
);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"admin":"false"}}',
  true
);
SELECT public.transfer_demo_asset(
  'recipient@example.test',
  'BTC',
  3,
  'b0000000-0000-0000-0000-000000000001'
);
COMMIT;

DO $assert_transfer$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '20000000-0000-0000-0000-000000000002'
        AND asset = 'BTC') <> 7
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND asset = 'BTC') <> 5
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND entry_type IN ('transfer_sent', 'transfer_received')) <> 2
     OR (SELECT count(*) FROM public.transactions
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND type IN ('transfer_sent', 'transfer_received')) <> 2
     OR (SELECT count(*) FROM public.notifications
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND title IN ('Transfer sent', 'Transfer received')) <> 2 THEN
    RAISE EXCEPTION 'Transfer replay did not create one atomic set of records';
  END IF;
END;
$assert_transfer$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"admin":"false"}}',
  true
);
DO $assert_insufficient_balance$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.transfer_demo_asset(
      'recipient@example.test',
      'BTC',
      100,
      'b0000000-0000-0000-0000-000000000002'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := SQLERRM = 'Insufficient balance.';
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Transfer exceeding balance was not rejected';
  END IF;
END;
$assert_insufficient_balance$;
COMMIT;

DO $assert_failed_transfer_atomic$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '20000000-0000-0000-0000-000000000002'
        AND asset = 'BTC') <> 7
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND entry_type IN ('transfer_sent', 'transfer_received')) <> 2 THEN
    RAISE EXCEPTION 'Failed transfer changed balances or ledger';
  END IF;

  IF (SELECT count(*) FROM public.transactions
      WHERE user_id IN (
        '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000003'
      )
        AND type IN ('transfer_sent', 'transfer_received')) <> 2
     OR (SELECT count(*) FROM public.notifications
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND title IN ('Transfer sent', 'Transfer received')) <> 2 THEN
    RAISE EXCEPTION 'Failed transfer changed transaction or notification history';
  END IF;
END;
$assert_failed_transfer_atomic$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"admin":"true"}}',
  true
);
SELECT public.admin_send_demo_asset(
  'recipient@example.test',
  'LTC',
  12,
  'b0000000-0000-0000-0000-000000000003'
);
SELECT public.admin_send_demo_asset(
  'recipient@example.test',
  'LTC',
  12,
  'b0000000-0000-0000-0000-000000000003'
);
COMMIT;

DO $assert_admin_send$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '10000000-0000-0000-0000-000000000001'
        AND asset = 'LTC') <> 0
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND asset = 'LTC') <> 12
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000003'
         )
           AND entry_type IN (
             'admin_transfer_sent',
             'admin_transfer_received'
           )) <> 2
     OR (SELECT count(*) FROM public.transactions
         WHERE user_id IN (
           '10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000003'
         )
           AND type IN (
             'admin_transfer_sent',
             'admin_transfer_received'
           )) <> 2 THEN
    RAISE EXCEPTION
      'Admin send should credit the recipient without debiting the admin, and replay once';
  END IF;
END;
$assert_admin_send$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"admin":"false"}}',
  true
);
DO $assert_non_admin_send_rejected$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.admin_send_demo_asset(
      'recipient@example.test',
      'BTC',
      50,
      'b0000000-0000-0000-0000-000000000004'
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    rejected := SQLERRM = 'Admin access required.';
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Non-admin account was allowed to use admin send';
  END IF;
END;
$assert_non_admin_send_rejected$;
COMMIT;

DO $assert_function_privileges$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    WHERE p.oid =
        'public.transfer_demo_asset(text,text,numeric,uuid)'::regprocedure
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND EXISTS (
        SELECT 1
        FROM pg_options_to_table(p.proconfig) AS option
        WHERE option.option_name = 'search_path'
          AND option.option_value = '""'
      )
  )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_proc AS p
       WHERE p.oid =
           'public.admin_credit_demo_asset(uuid,text,numeric,uuid)'::regprocedure
         AND p.prosecdef
         AND pg_get_userbyid(p.proowner) = 'postgres'
         AND EXISTS (
           SELECT 1
           FROM pg_options_to_table(p.proconfig) AS option
           WHERE option.option_name = 'search_path'
             AND option.option_value = '""'
         )
     ) THEN
    RAISE EXCEPTION
      'Request-ID RPCs must be postgres-owned SECURITY DEFINER functions with an empty search_path';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.transfer_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.transfer_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_credit_demo_asset(uuid, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_table_privilege(
       'authenticated',
       'coinmaster_private.accounting_requests',
       'SELECT'
     )
     OR has_table_privilege(
       'authenticated',
       'coinmaster_private.accounting_requests',
       'INSERT'
     )
     OR has_schema_privilege(
       'authenticated',
       'coinmaster_private',
       'USAGE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.wallet_balances',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'Legacy RPC or private idempotency grants remain exposed';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.transfer_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_credit_demo_asset(uuid, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Authenticated request-ID RPC grants are missing';
  END IF;
END;
$assert_function_privileges$;
