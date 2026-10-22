-- Run after 20261018201500_secure_user_data_tables.sql. The preflight fails
-- closed if client table writes or the required RLS protections remain open.
BEGIN;

DO $preflight$
DECLARE
  required_column record;
  wallet_primary_key boolean;
  wallet_nonnegative_check boolean;
  wallet_asset_check boolean;
  ledger_positive_check boolean;
  target_table record;
  target_column record;
  role_name name;
  privilege_name text;
  relation_name text;
BEGIN
  IF to_regprocedure('public.transfer_demo_asset(text,text,numeric)') IS NULL
     OR to_regprocedure('public.admin_credit_demo_asset(uuid,text,numeric)') IS NULL THEN
    RAISE EXCEPTION
      'Expected existing three-argument accounting RPCs were not found';
  END IF;

  FOR required_column IN
    SELECT *
    FROM (
      VALUES
        ('wallet_balances', 'user_id', 'uuid'),
        ('wallet_balances', 'asset', 'text'),
        ('wallet_balances', 'balance', 'numeric'),
        ('wallet_balances', 'updated_at', 'timestamptz'),
        ('ledger_entries', 'id', 'uuid'),
        ('ledger_entries', 'user_id', 'uuid'),
        ('ledger_entries', 'asset', 'text'),
        ('ledger_entries', 'amount', 'numeric'),
        ('ledger_entries', 'entry_type', 'text'),
        ('ledger_entries', 'related_user_id', 'uuid'),
        ('ledger_entries', 'created_at', 'timestamptz'),
        ('transactions', 'id', 'uuid'),
        ('transactions', 'user_id', 'uuid'),
        ('transactions', 'amount', 'numeric'),
        ('transactions', 'currency', 'text'),
        ('transactions', 'type', 'text'),
        ('transactions', 'status', 'text'),
        ('transactions', 'created_at', 'timestamptz'),
        ('notifications', 'id', 'uuid'),
        ('notifications', 'user_id', 'uuid'),
        ('notifications', 'title', 'text'),
        ('notifications', 'message', 'text'),
        ('notifications', 'created_at', 'timestamptz')
    ) AS columns_required(table_name, column_name, udt_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public'
        AND c.table_name = required_column.table_name
        AND c.column_name = required_column.column_name
        AND c.udt_name = required_column.udt_name
    ) THEN
      RAISE EXCEPTION
        'Expected column public.%.% with type % was not found',
        required_column.table_name,
        required_column.column_name,
        required_column.udt_name;
    END IF;
  END LOOP;

  FOR target_table IN
    SELECT unnest(ARRAY[
      'profiles',
      'transactions',
      'wallet_balances',
      'ledger_entries',
      'notifications'
    ]) AS table_name
  LOOP
    IF to_regclass(format('public.%I', target_table.table_name)) IS NULL
       OR NOT (
         SELECT c.relrowsecurity
         FROM pg_class AS c
         WHERE c.oid =
           to_regclass(format('public.%I', target_table.table_name))
       ) THEN
      RAISE EXCEPTION
        'The prior user-data security migration must enable RLS on public.%',
        target_table.table_name;
    END IF;

    relation_name := format('%I.%I', 'public', target_table.table_name);

    FOR role_name IN
      SELECT unnest(ARRAY['anon', 'authenticated']::name[])
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
        IF has_table_privilege(role_name, relation_name, privilege_name) THEN
          RAISE EXCEPTION
            'Client role % still has % on %; apply the user-data security migration first',
            role_name,
            privilege_name,
            relation_name;
        END IF;
      END LOOP;

      FOR target_column IN
        SELECT c.column_name
        FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND c.table_name = target_table.table_name
      LOOP
        FOREACH privilege_name IN ARRAY ARRAY[
          'INSERT',
          'UPDATE',
          'REFERENCES'
        ]
        LOOP
          IF has_column_privilege(
            role_name,
            relation_name,
            target_column.column_name,
            privilege_name
          ) THEN
            RAISE EXCEPTION
              'Client role % still has column privilege % on %.%; apply the user-data security migration first',
              role_name,
              privilege_name,
              relation_name,
              target_column.column_name;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.wallet_balances'::regclass
      AND con.contype = 'p'
      AND (
        SELECT array_agg(a.attname::text ORDER BY key_column.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY
          AS key_column(attnum, ordinality)
        JOIN pg_attribute AS a
          ON a.attrelid = con.conrelid
         AND a.attnum = key_column.attnum
      ) = ARRAY['user_id', 'asset']::text[]
  )
  INTO wallet_primary_key;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.wallet_balances'::regclass
      AND con.contype = 'c'
      AND con.convalidated
      AND pg_get_constraintdef(con.oid) ILIKE '%balance%>=%0%'
  )
  INTO wallet_nonnegative_check;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.wallet_balances'::regclass
      AND con.contype = 'c'
      AND con.convalidated
      AND pg_get_constraintdef(con.oid) LIKE '%BTC%'
      AND pg_get_constraintdef(con.oid) LIKE '%ETH%'
      AND pg_get_constraintdef(con.oid) LIKE '%USDT%'
      AND pg_get_constraintdef(con.oid) LIKE '%USDC%'
      AND pg_get_constraintdef(con.oid) LIKE '%LTC%'
      AND pg_get_constraintdef(con.oid) LIKE '%BNB%'
      AND pg_get_constraintdef(con.oid) LIKE '%SOL%'
  )
  INTO wallet_asset_check;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.ledger_entries'::regclass
      AND con.contype = 'c'
      AND con.convalidated
      AND pg_get_constraintdef(con.oid) ILIKE '%amount%>%0%'
  )
  INTO ledger_positive_check;

  IF NOT wallet_primary_key
     OR NOT wallet_nonnegative_check
     OR NOT wallet_asset_check
     OR NOT ledger_positive_check THEN
    RAISE EXCEPTION
      'Wallet primary key/check constraints or positive ledger amount constraint differ from the inspected schema';
  END IF;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS coinmaster_private AUTHORIZATION postgres;
ALTER SCHEMA coinmaster_private OWNER TO postgres;
REVOKE ALL ON SCHEMA coinmaster_private
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS coinmaster_private.accounting_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (
    operation IN ('admin_credit', 'transfer')
  ),
  payload jsonb NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (actor_id, request_id),
  CHECK (
    (response IS NULL AND completed_at IS NULL)
    OR (response IS NOT NULL AND completed_at IS NOT NULL)
  )
);

ALTER TABLE coinmaster_private.accounting_requests
  OWNER TO postgres;
ALTER TABLE coinmaster_private.accounting_requests
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coinmaster_private.accounting_requests
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_credit_demo_asset(
  p_user_id uuid,
  p_asset text,
  p_amount numeric,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_existing_operation text;
  v_existing_payload jsonb;
  v_response jsonb;
  v_inserted integer;
BEGIN
  IF v_actor IS NULL
     OR COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'admin') = 'true',
       false
     ) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A request ID is required.';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A recipient account is required.';
  END IF;

  IF p_asset IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL') THEN
    RAISE EXCEPTION 'Unsupported asset.';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Enter a valid positive amount.';
  END IF;

  v_payload := jsonb_build_object(
    'user_id', p_user_id,
    'asset', p_asset,
    'amount', p_amount
  );

  INSERT INTO coinmaster_private.accounting_requests
    (actor_id, request_id, operation, payload)
  VALUES
    (v_actor, p_request_id, 'admin_credit', v_payload)
  ON CONFLICT (actor_id, request_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT operation, payload, response
      INTO v_existing_operation, v_existing_payload, v_response
    FROM coinmaster_private.accounting_requests
    WHERE actor_id = v_actor
      AND request_id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not resolve the prior request.';
    END IF;

    IF v_existing_operation <> 'admin_credit'
       OR v_existing_payload <> v_payload THEN
      RAISE EXCEPTION
        'Request ID was already used with a different operation or payload.';
    END IF;

    IF v_response IS NULL THEN
      RAISE EXCEPTION 'The prior request has no completed result.';
    END IF;

    RETURN v_response;
  END IF;

  INSERT INTO public.wallet_balances (user_id, asset)
  VALUES (p_user_id, p_asset)
  ON CONFLICT (user_id, asset) DO NOTHING;

  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND asset = p_asset;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient wallet could not be initialized.';
  END IF;

  INSERT INTO public.ledger_entries
    (user_id, asset, amount, entry_type)
  VALUES
    (p_user_id, p_asset, p_amount, 'admin_credit');

  INSERT INTO public.transactions
    (user_id, amount, currency, type, status)
  VALUES
    (p_user_id, p_amount, p_asset, 'admin_credit', 'completed');

  INSERT INTO public.notifications (user_id, title, message)
  VALUES (
    p_user_id,
    'Balance credited',
    p_amount::text || ' ' || p_asset ||
      ' was credited to your account by an administrator.'
  );

  v_response := jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'user_id', p_user_id,
    'asset', p_asset,
    'amount', p_amount
  );

  UPDATE coinmaster_private.accounting_requests
  SET response = v_response,
      completed_at = clock_timestamp()
  WHERE actor_id = v_actor
    AND request_id = p_request_id;

  RETURN v_response;
END;
$function$;

ALTER FUNCTION public.admin_credit_demo_asset(uuid, text, numeric, uuid)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION coinmaster_private.transfer_demo_asset_internal(
  p_recipient_email text,
  p_asset text,
  p_amount numeric,
  p_request_id uuid,
  p_admin_send boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_amount numeric(30, 10);
  v_balance numeric;
  v_payload jsonb;
  v_existing_operation text;
  v_existing_payload jsonb;
  v_response jsonb;
  v_inserted integer;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  IF p_admin_send
     AND COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'admin') = 'true',
       false
     ) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A request ID is required.';
  END IF;

  IF p_asset IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL') THEN
    RAISE EXCEPTION 'Unsupported asset.';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Enter a valid positive amount.';
  END IF;

  v_amount := p_amount;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount is below supported precision.';
  END IF;

  IF p_recipient_email IS NULL OR btrim(p_recipient_email) = '' THEN
    RAISE EXCEPTION 'A recipient account is required.';
  END IF;

  SELECT u.id
    INTO v_recipient
  FROM auth.users AS u
  WHERE lower(u.email) = lower(btrim(p_recipient_email))
  LIMIT 1;

  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'Recipient account not found.';
  END IF;

  IF v_recipient = v_sender THEN
    RAISE EXCEPTION 'You cannot transfer to yourself.';
  END IF;

  v_payload := jsonb_build_object(
    'recipient_user_id', v_recipient,
    'asset', p_asset,
    'amount', v_amount
  );
  IF p_admin_send THEN
    v_payload := v_payload || jsonb_build_object('admin_send', true);
  END IF;

  INSERT INTO coinmaster_private.accounting_requests
    (actor_id, request_id, operation, payload)
  VALUES
    (
      v_sender,
      p_request_id,
      'transfer',
      v_payload
    )
  ON CONFLICT (actor_id, request_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT operation, payload, response
      INTO v_existing_operation, v_existing_payload, v_response
    FROM coinmaster_private.accounting_requests
    WHERE actor_id = v_sender
      AND request_id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not resolve the prior request.';
    END IF;

    IF v_existing_operation <> 'transfer'
       OR v_existing_payload <> v_payload THEN
      RAISE EXCEPTION
        'Request ID was already used with a different operation or payload.';
    END IF;

    IF v_response IS NULL THEN
      RAISE EXCEPTION 'The prior request has no completed result.';
    END IF;

    RETURN v_response;
  END IF;

  INSERT INTO public.wallet_balances (user_id, asset)
  VALUES (v_recipient, p_asset)
  ON CONFLICT (user_id, asset) DO NOTHING;

  -- Lock both rows in stable UUID order to prevent reciprocal-transfer
  -- deadlocks, then read and validate the sender's current balance.
  PERFORM wb.user_id
  FROM public.wallet_balances AS wb
  WHERE wb.asset = p_asset
    AND wb.user_id IN (v_sender, v_recipient)
  ORDER BY wb.user_id
  FOR UPDATE;

  SELECT wb.balance
    INTO v_balance
  FROM public.wallet_balances AS wb
  WHERE wb.user_id = v_sender
    AND wb.asset = p_asset;

  IF NOT p_admin_send THEN
    IF v_balance IS NULL OR v_balance < v_amount THEN
      RAISE EXCEPTION 'Insufficient balance.';
    END IF;

    UPDATE public.wallet_balances
    SET balance = balance - v_amount,
        updated_at = now()
    WHERE user_id = v_sender
      AND asset = p_asset;
  END IF;

  UPDATE public.wallet_balances
  SET balance = balance + v_amount,
      updated_at = now()
  WHERE user_id = v_recipient
    AND asset = p_asset;

  INSERT INTO public.ledger_entries
    (user_id, asset, amount, entry_type, related_user_id)
  VALUES
    (
      v_sender,
      p_asset,
      v_amount,
      CASE WHEN p_admin_send THEN 'admin_transfer_sent' ELSE 'transfer_sent' END,
      v_recipient
    ),
    (
      v_recipient,
      p_asset,
      v_amount,
      CASE WHEN p_admin_send THEN 'admin_transfer_received' ELSE 'transfer_received' END,
      v_sender
    );

  INSERT INTO public.transactions
    (user_id, amount, currency, type, status)
  VALUES
    (
      v_sender,
      v_amount,
      p_asset,
      CASE WHEN p_admin_send THEN 'admin_transfer_sent' ELSE 'transfer_sent' END,
      'completed'
    ),
    (
      v_recipient,
      v_amount,
      p_asset,
      CASE WHEN p_admin_send THEN 'admin_transfer_received' ELSE 'transfer_received' END,
      'completed'
    );

  INSERT INTO public.notifications (user_id, title, message)
  VALUES
    (
      v_sender,
      CASE WHEN p_admin_send THEN 'Admin transfer sent' ELSE 'Transfer sent' END,
      'You sent ' || v_amount::text || ' ' || p_asset || ' to another account.'
    ),
    (
      v_recipient,
      CASE WHEN p_admin_send THEN 'Admin transfer received' ELSE 'Transfer received' END,
      CASE
        WHEN p_admin_send THEN
          'An administrator sent you ' || v_amount::text || ' ' || p_asset || '.'
        ELSE
          'You received ' || v_amount::text || ' ' || p_asset || ' from another account.'
      END
    );

  v_response := jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'asset', p_asset,
    'amount', v_amount,
    'message', 'Transfer completed.'
  );

  UPDATE coinmaster_private.accounting_requests
  SET response = v_response,
      completed_at = clock_timestamp()
  WHERE actor_id = v_sender
    AND request_id = p_request_id;

  RETURN v_response;
END;
$function$;

ALTER FUNCTION coinmaster_private.transfer_demo_asset_internal(
  text,
  text,
  numeric,
  uuid,
  boolean
)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.transfer_demo_asset(
  p_recipient_email text,
  p_asset text,
  p_amount numeric,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coinmaster_private.transfer_demo_asset_internal(
    p_recipient_email,
    p_asset,
    p_amount,
    p_request_id,
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.admin_send_demo_asset(
  p_recipient_email text,
  p_asset text,
  p_amount numeric,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coinmaster_private.transfer_demo_asset_internal(
    p_recipient_email,
    p_asset,
    p_amount,
    p_request_id,
    true
  )
$function$;

ALTER FUNCTION public.transfer_demo_asset(text, text, numeric, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  OWNER TO postgres;

-- The legacy signatures do not accept request IDs and must not remain a
-- client-accessible route around idempotency protection.
REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.transfer_demo_asset(text, text, numeric)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric, uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.transfer_demo_asset(text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.transfer_demo_asset(text, text, numeric, uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION coinmaster_private.transfer_demo_asset_internal(
    text,
    text,
    numeric,
    uuid,
    boolean
  )
  FROM PUBLIC, anon, authenticated, service_role;

DO $postflight$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.admin_credit_demo_asset(uuid, text, numeric, uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_credit_demo_asset(uuid, text, numeric, uuid)',
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
     OR NOT has_function_privilege(
       'authenticated',
       'public.transfer_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.admin_send_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_send_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'coinmaster_private.transfer_demo_asset_internal(text, text, numeric, uuid, boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_credit_demo_asset(uuid, text, numeric)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.transfer_demo_asset(text, text, numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'Unexpected effective execution privileges on accounting RPC signatures';
  END IF;
END;
$postflight$;

COMMIT;
