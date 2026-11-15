BEGIN;

DO $financial_rpc_overload_preflight$
DECLARE
  function_row record;
  allowed_signatures text[] := ARRAY[
    'get_withdrawal_network_fees()',
    'get_deposit_destinations()',
    'submit_withdrawal_request(text, text, text, numeric, uuid)',
    'create_deposit_request(text, numeric, uuid)',
    'create_deposit_request(text, text, numeric, uuid)',
    'configure_deposit_destination(uuid, text, text, text, text)',
    'verify_deposit_request(uuid, text, text, uuid)',
    'set_withdrawal_network_fee(text, text, numeric, text, uuid)',
    'set_withdrawal_fee_active(text, text, boolean, uuid)',
    'approve_withdrawal_request(uuid, uuid)',
    'decline_withdrawal_request(uuid, text, uuid)',
    'mark_withdrawal_processing(uuid, uuid)',
    'complete_verified_withdrawal(uuid, text, text, uuid)',
    'credit_verified_deposit(uuid, uuid)',
    'decline_deposit_request(uuid, text, uuid)',
    'approve_deposit_request(uuid, uuid)',
    'get_backend_requests(text, text, text, integer, integer)',
    'get_backend_history(text, text, integer)',
    'get_backend_overview()'
  ];
BEGIN
  FOR function_row IN
    SELECT format(
      '%I(%s)',
      p.proname,
      oidvectortypes(p.proargtypes)
    ) AS signature
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_withdrawal_network_fees',
        'get_deposit_destinations',
        'submit_withdrawal_request',
        'create_deposit_request',
        'configure_deposit_destination',
        'verify_deposit_request',
        'set_withdrawal_network_fee',
        'set_withdrawal_fee_active',
        'approve_withdrawal_request',
        'decline_withdrawal_request',
        'mark_withdrawal_processing',
        'complete_verified_withdrawal',
        'credit_verified_deposit',
        'decline_deposit_request',
        'approve_deposit_request',
        'get_backend_requests',
        'get_backend_history',
        'get_backend_overview'
      ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM unnest(allowed_signatures) AS allowed(signature)
      WHERE allowed.signature = function_row.signature
    ) THEN
      RAISE EXCEPTION
        'Unexpected financial RPC overload %. Inspect its callers and privileges before migration.',
        function_row.signature;
    END IF;
  END LOOP;
END;
$financial_rpc_overload_preflight$;

DO $financial_rpc_dependency_preflight$
DECLARE
  dependency_row record;
BEGIN
  FOR dependency_row IN
    SELECT
      p.proname,
      oidvectortypes(p.proargtypes) AS argument_types,
      d.classid::regclass AS dependent_catalog,
      d.objid AS dependent_object_id
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_depend AS d
      ON d.refclassid = 'pg_proc'::regclass
     AND d.refobjid = p.oid
     AND d.deptype NOT IN ('i', 'e')
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_withdrawal_network_fees',
        'get_deposit_destinations',
        'configure_deposit_destination',
        'verify_deposit_request',
        'set_withdrawal_network_fee',
        'set_withdrawal_fee_active',
        'mark_withdrawal_processing',
        'complete_verified_withdrawal',
        'credit_verified_deposit',
        'create_deposit_request',
        'get_backend_requests',
        'get_backend_history'
      ])
  LOOP
    RAISE EXCEPTION
      'Financial RPC %.% has dependent object %.%; inspect callers before retiring it.',
      dependency_row.proname,
      dependency_row.argument_types,
      dependency_row.dependent_catalog,
      dependency_row.dependent_object_id;
  END LOOP;
END;
$financial_rpc_dependency_preflight$;

DROP FUNCTION IF EXISTS public.get_withdrawal_network_fees();
DROP FUNCTION IF EXISTS public.get_deposit_destinations();
DROP FUNCTION IF EXISTS public.configure_deposit_destination(uuid,text,text,text,text);
DROP FUNCTION IF EXISTS public.verify_deposit_request(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.set_withdrawal_network_fee(text,text,numeric,text,uuid);
DROP FUNCTION IF EXISTS public.set_withdrawal_fee_active(text,text,boolean,uuid);
DROP FUNCTION IF EXISTS public.mark_withdrawal_processing(uuid,uuid);
DROP FUNCTION IF EXISTS public.complete_verified_withdrawal(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.credit_verified_deposit(uuid,uuid);
DROP FUNCTION IF EXISTS public.create_deposit_request(text,text,numeric,uuid);
DROP FUNCTION IF EXISTS public.create_deposit_request(text,numeric,uuid);
DROP FUNCTION IF EXISTS public.get_backend_requests(text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.get_backend_history(text,text,integer);

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS fee_amount numeric,
  ADD COLUMN IF NOT EXISTS net_amount numeric;
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS gross_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_amount numeric,
  ADD COLUMN IF NOT EXISTS net_amount numeric;

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check,
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_internal_check,
  DROP CONSTRAINT IF EXISTS withdrawal_requests_failed_review_internal_check,
  DROP CONSTRAINT IF EXISTS withdrawal_requests_completed_review_internal_check;
ALTER TABLE public.deposit_requests
  DROP CONSTRAINT IF EXISTS deposit_requests_status_check,
  DROP CONSTRAINT IF EXISTS deposit_requests_status_internal_check,
  DROP CONSTRAINT IF EXISTS deposit_requests_review_internal_check;
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_financial_amounts_check;

DO $drop_deposit_provider_checks$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid = 'public.deposit_requests'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%provider%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      constraint_row.table_name,
      constraint_row.conname
    );
  END LOOP;
END;
$drop_deposit_provider_checks$;
ALTER TABLE public.deposit_requests
  ALTER COLUMN network DROP NOT NULL,
  ALTER COLUMN destination_address DROP NOT NULL;



ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_internal_check
    CHECK (status IN ('pending', 'approved', 'declined', 'processing', 'completed', 'failed')),
  ADD CONSTRAINT withdrawal_requests_failed_review_internal_check
    CHECK (
      status <> 'failed'
      OR (
        admin_user_id IS NOT NULL
        AND decided_at IS NOT NULL
        AND length(btrim(COALESCE(decline_reason, ''))) > 0
      )
    ),
  ADD CONSTRAINT withdrawal_requests_completed_review_internal_check
    CHECK (
      status <> 'completed'
      OR (admin_user_id IS NOT NULL AND decided_at IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.deposit_requests
  ADD CONSTRAINT deposit_requests_status_internal_check
    CHECK (status IN ('pending', 'verified', 'completed', 'rejected', 'failed')),
  ADD CONSTRAINT deposit_requests_review_internal_check
    CHECK (
      status NOT IN ('completed', 'failed')
      OR (
        reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND (
          status <> 'failed'
          OR length(btrim(COALESCE(review_reason, ''))) > 0
        )
      )
    ) NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_financial_amounts_check
    CHECK (
      (gross_amount IS NULL AND fee_amount IS NULL AND net_amount IS NULL)
      OR (
        gross_amount > 0
        AND fee_amount IS NOT NULL
        AND fee_amount >= 0
        AND net_amount IS NOT NULL
        AND net_amount > 0
        AND net_amount = gross_amount - fee_amount
      )
    ) NOT VALID;

REVOKE SELECT ON TABLE public.withdrawal_requests,
  public.deposit_requests FROM authenticated;
GRANT SELECT (
  id, user_id, idempotency_key, asset, amount, network,
  destination_address, fee_amount, net_amount, status,
  request_payload, created_at, updated_at
) ON TABLE public.withdrawal_requests, public.deposit_requests
  TO authenticated;
GRANT SELECT (gross_amount, fee_amount, net_amount)
  ON TABLE public.transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_withdrawal_request(
  p_asset text,
  p_network text,
  p_destination_address text,
  p_amount numeric,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_request public.withdrawal_requests%ROWTYPE;
  v_new_balance numeric;
  v_inserted integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A request ID is required.';
  END IF;
  IF p_asset IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL') THEN
    RAISE EXCEPTION 'Unsupported asset.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Enter a valid positive amount.';
  END IF;
  IF p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Enter an amount with no more than two decimal places.';
  END IF;
  IF NOT (
    (p_asset = 'BTC' AND p_network = 'Bitcoin')
    OR (p_asset = 'ETH' AND p_network = 'Ethereum (ERC20)')
    OR (p_asset = 'USDT' AND p_network IN ('TRON (TRC20)', 'Ethereum (ERC20)'))
    OR (p_asset = 'USDC' AND p_network IN ('Ethereum (ERC20)', 'Solana'))
    OR (p_asset = 'LTC' AND p_network = 'Litecoin')
    OR (p_asset = 'BNB' AND p_network = 'BNB Smart Chain (BEP20)')
    OR (p_asset = 'SOL' AND p_network = 'Solana')
  )
     OR p_destination_address IS NULL
     OR length(btrim(p_destination_address)) NOT BETWEEN 8 AND 512 THEN
    RAISE EXCEPTION 'Withdrawal details are invalid.';
  END IF;

  v_payload := jsonb_build_object(
    'asset', p_asset,
    'network', p_network,
    'destination_address', btrim(p_destination_address),
    'amount', p_amount
  );
  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.request_payload <> v_payload THEN
      RAISE EXCEPTION
        'Request ID was already used with different withdrawal details.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events AS event
      WHERE event.action_id = p_idempotency_key
        AND event.request_kind = 'withdrawal'
        AND event.request_id = v_request.id
        AND event.action = 'withdrawal_submitted'
    ) THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'amount', v_request.amount,
        'asset', v_request.asset,
        'fee_amount', 0,
        'net_amount', v_request.amount
      );
    END IF;
    RAISE EXCEPTION 'The prior withdrawal request has no completed result.';
  END IF;

  INSERT INTO public.withdrawal_requests (
    user_id, idempotency_key, asset, amount, network, destination_address,
    fee_amount, net_amount, request_payload
  )
  VALUES (
    v_actor, p_idempotency_key, p_asset, p_amount, p_network,
    btrim(p_destination_address), 0, p_amount, v_payload
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND OR v_request.request_payload <> v_payload THEN
    RAISE EXCEPTION
      'Request ID was already used with different withdrawal details.';
  END IF;

  IF v_inserted = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events AS event
      WHERE event.action_id = p_idempotency_key
        AND event.request_kind = 'withdrawal'
        AND event.request_id = v_request.id
        AND event.action = 'withdrawal_submitted'
    ) THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'amount', v_request.amount,
        'asset', v_request.asset,
        'fee_amount', 0,
        'net_amount', v_request.amount
      );
    END IF;
    RAISE EXCEPTION 'The prior withdrawal request has no completed result.';
  END IF;

  UPDATE public.wallet_balances
  SET balance = balance - p_amount,
      updated_at = clock_timestamp()
  WHERE user_id = v_actor
    AND asset = p_asset
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient available balance.';
  END IF;

  INSERT INTO public.ledger_entries (
    user_id, asset, amount, entry_type, request_kind, request_id
  )
  VALUES (
    v_actor, p_asset, p_amount, 'withdrawal_reserved', 'withdrawal', v_request.id
  );
  INSERT INTO public.transactions (
    user_id, amount, currency, type, status, request_kind, request_id,
    gross_amount, fee_amount, net_amount
  )
  VALUES (
    v_actor, p_amount, p_asset, 'withdrawal', 'processing', 'withdrawal', v_request.id,
    p_amount, 0, p_amount
  );
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_idempotency_key, 'withdrawal', v_request.id, v_actor,
    'withdrawal_submitted', v_payload
  );

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', 'pending',
    'amount', p_amount,
    'asset', p_asset,
    'fee_amount', 0,
    'net_amount', p_amount,
    'available_balance', v_new_balance
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_deposit_request(
  p_asset text,
  p_amount numeric,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_fee numeric;
  v_net numeric;
  v_payload jsonb;
  v_request public.deposit_requests%ROWTYPE;
  v_inserted integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A request ID is required.';
  END IF;
  IF p_asset IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL') THEN
    RAISE EXCEPTION 'Unsupported asset.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Enter a valid positive amount.';
  END IF;
  IF p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Enter an amount with no more than two decimal places.';
  END IF;

  v_fee := round(p_amount * 0.07, 2);
  v_net := p_amount - v_fee;
  IF v_fee < 0 OR v_fee >= p_amount OR v_net <= 0 THEN
    RAISE EXCEPTION 'The deposit amount is too small to process.';
  END IF;
  v_payload := jsonb_build_object(
    'asset', p_asset,
    'amount', p_amount,
    'fee_amount', v_fee,
    'net_amount', v_net
  );

  SELECT * INTO v_request
  FROM public.deposit_requests
  WHERE user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.request_payload <> v_payload THEN
      RAISE EXCEPTION
        'Request ID was already used with different deposit details.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events AS event
      WHERE event.action_id = p_idempotency_key
        AND event.request_kind = 'deposit'
        AND event.request_id = v_request.id
        AND event.action = 'deposit_requested'
    ) THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'asset', v_request.asset,
        'amount', v_request.amount,
        'fee_amount', v_request.fee_amount,
        'net_amount', v_request.net_amount
      );
    END IF;
    RAISE EXCEPTION 'The prior deposit request has no completed result.';
  END IF;

  INSERT INTO public.deposit_requests (
    user_id, idempotency_key, asset, amount, network, destination_address,
    fee_amount, net_amount, request_payload
  )
  VALUES (
    v_actor, p_idempotency_key, p_asset, p_amount, NULL, NULL,
    v_fee, v_net, v_payload
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_request
  FROM public.deposit_requests
  WHERE user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND OR v_request.request_payload <> v_payload THEN
    RAISE EXCEPTION
      'Request ID was already used with different deposit details.';
  END IF;
  IF v_inserted = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events AS event
      WHERE event.action_id = p_idempotency_key
        AND event.request_kind = 'deposit'
        AND event.request_id = v_request.id
        AND event.action = 'deposit_requested'
    ) THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'asset', v_request.asset,
        'amount', v_request.amount,
        'fee_amount', v_request.fee_amount,
        'net_amount', v_request.net_amount
      );
    END IF;
    RAISE EXCEPTION 'The prior deposit request has no completed result.';
  END IF;

  INSERT INTO public.transactions (
    user_id, amount, currency, type, status, request_kind, request_id,
    gross_amount, fee_amount, net_amount
  )
  VALUES (
    v_actor, v_net, p_asset, 'deposit', 'pending', 'deposit', v_request.id,
    p_amount, v_fee, v_net
  );
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_idempotency_key, 'deposit', v_request.id, v_actor,
    'deposit_requested', v_payload
  );
  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', 'pending',
    'asset', p_asset,
    'amount', p_amount,
    'fee_amount', v_fee,
    'net_amount', v_net
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(
  p_request_id uuid,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL THEN
    RAISE EXCEPTION 'Request and action IDs are required.';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request was not found.';
  END IF;
  IF v_request.status = 'completed'
     AND v_request.admin_user_id = v_actor
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'withdrawal_approved'
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be approved.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE request_kind = 'withdrawal'
      AND request_id = p_request_id
      AND user_id = v_request.user_id
      AND asset = v_request.asset
      AND amount = v_request.amount
      AND entry_type = 'withdrawal_reserved'
  )
     OR EXISTS (
       SELECT 1
       FROM public.ledger_entries
       WHERE request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND entry_type IN ('withdrawal_debit', 'withdrawal_release')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.transactions
       WHERE request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND user_id = v_request.user_id
         AND currency = v_request.asset
         AND amount = v_request.amount
     ) THEN
    RAISE EXCEPTION 'Withdrawal reservation accounting requires reconciliation.';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'completed',
      admin_user_id = v_actor,
      decided_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.ledger_entries
  SET entry_type = 'withdrawal_debit'
  WHERE request_kind = 'withdrawal'
    AND request_id = p_request_id
    AND entry_type = 'withdrawal_reserved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reserved withdrawal ledger entry is missing.';
  END IF;
  UPDATE public.transactions
  SET status = 'completed'
  WHERE request_kind = 'withdrawal' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The withdrawal transaction record is missing.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'withdrawal', p_request_id, v_actor,
    'withdrawal_approved', '{}'::jsonb
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_withdrawal_request(
  p_request_id uuid,
  p_reason text,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_request public.withdrawal_requests%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A decline reason is required.';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request was not found.';
  END IF;
  v_payload := jsonb_build_object('reason', btrim(p_reason));
  IF v_request.status = 'failed'
     AND v_request.admin_user_id = v_actor
     AND v_request.decline_reason = btrim(p_reason)
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'withdrawal_declined'
         AND details = v_payload
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'failed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be declined.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries
    WHERE request_kind = 'withdrawal'
      AND request_id = p_request_id
      AND user_id = v_request.user_id
      AND asset = v_request.asset
      AND amount = v_request.amount
      AND entry_type = 'withdrawal_reserved'
  )
     OR EXISTS (
       SELECT 1 FROM public.ledger_entries
       WHERE request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND entry_type IN ('withdrawal_debit', 'withdrawal_release')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.transactions
       WHERE request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND user_id = v_request.user_id
         AND currency = v_request.asset
         AND amount = v_request.amount
     ) THEN
    RAISE EXCEPTION 'Withdrawal reservation accounting requires reconciliation.';
  END IF;

  UPDATE public.wallet_balances
  SET balance = balance + v_request.amount,
      updated_at = clock_timestamp()
  WHERE user_id = v_request.user_id
    AND asset = v_request.asset;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reserved wallet balance could not be restored.';
  END IF;
  INSERT INTO public.ledger_entries (
    user_id, asset, amount, entry_type, request_kind, request_id
  )
  VALUES (
    v_request.user_id, v_request.asset, v_request.amount,
    'withdrawal_release', 'withdrawal', p_request_id
  );
  UPDATE public.withdrawal_requests
  SET status = 'failed',
      admin_user_id = v_actor,
      decided_at = clock_timestamp(),
      decline_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.transactions
  SET status = 'failed'
  WHERE request_kind = 'withdrawal' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The withdrawal transaction record is missing.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'withdrawal', p_request_id, v_actor,
    'withdrawal_declined', v_payload
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_deposit_request(
  p_request_id uuid,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_request public.deposit_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL THEN
    RAISE EXCEPTION 'Request and action IDs are required.';
  END IF;
  SELECT * INTO v_request FROM public.deposit_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit request was not found.';
  END IF;
  IF v_request.status = 'completed' AND v_request.reviewed_by = v_actor
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'deposit'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'deposit_approved'
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status NOT IN ('pending', 'verified') THEN
    RAISE EXCEPTION 'Only pending deposits can be approved.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE request_kind = 'deposit'
      AND request_id = p_request_id
      AND entry_type = 'deposit_credit'
  ) THEN
    RAISE EXCEPTION 'The deposit already has a credit entry and requires reconciliation.';
  END IF;

  INSERT INTO public.wallet_balances (user_id, asset, balance)
  VALUES (v_request.user_id, v_request.asset, v_request.net_amount)
  ON CONFLICT (user_id, asset)
  DO UPDATE SET
    balance = public.wallet_balances.balance + EXCLUDED.balance,
    updated_at = clock_timestamp();
  INSERT INTO public.ledger_entries (
    user_id, asset, amount, entry_type, request_kind, request_id
  )
  VALUES (
    v_request.user_id, v_request.asset, v_request.net_amount,
    'deposit_credit', 'deposit', p_request_id
  );
  UPDATE public.transactions
  SET status = 'completed',
      amount = v_request.net_amount,
      gross_amount = round(v_request.amount, 2),
      fee_amount = v_request.fee_amount,
      net_amount = v_request.net_amount
  WHERE request_kind = 'deposit' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The deposit transaction record is missing.';
  END IF;
  UPDATE public.deposit_requests
  SET status = 'completed',
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'deposit', p_request_id, v_actor,
    'deposit_approved', jsonb_build_object(
      'amount', v_request.amount,
      'fee_amount', v_request.fee_amount,
      'net_amount', v_request.net_amount
    )
  );
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'completed',
    'amount', v_request.amount,
    'fee_amount', v_request.fee_amount,
    'net_amount', v_request.net_amount,
    'asset', v_request.asset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_deposit_request(
  p_request_id uuid,
  p_reason text,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_request public.deposit_requests%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A decline reason is required.';
  END IF;
  SELECT * INTO v_request FROM public.deposit_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit request was not found.';
  END IF;
  v_payload := jsonb_build_object('reason', btrim(p_reason));
  IF v_request.status = 'failed'
     AND v_request.reviewed_by = v_actor
     AND v_request.review_reason = btrim(p_reason)
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'deposit'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'deposit_declined'
         AND details = v_payload
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'failed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status NOT IN ('pending', 'verified') THEN
    RAISE EXCEPTION 'Only pending deposits can be declined.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.ledger_entries
    WHERE request_kind = 'deposit'
      AND request_id = p_request_id
      AND entry_type = 'deposit_credit'
  ) THEN
    RAISE EXCEPTION 'The deposit already has a credit entry and requires reconciliation.';
  END IF;

  UPDATE public.transactions
  SET status = 'failed',
      gross_amount = round(v_request.amount, 2),
      fee_amount = v_request.fee_amount,
      net_amount = v_request.net_amount
  WHERE request_kind = 'deposit' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The deposit transaction record is missing.';
  END IF;
  UPDATE public.deposit_requests
  SET status = 'failed',
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      review_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'deposit', p_request_id, v_actor,
    'deposit_declined', v_payload
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_backend_requests(
  p_request_kind text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_search text DEFAULT '',
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  request_kind text,
  request_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  asset text,
  amount numeric,
  network text,
  destination_address text,
  fee_amount numeric,
  net_amount numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  admin_user_id uuid,
  admin_name text,
  admin_email text,
  decision_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_search text := '%' || left(COALESCE(p_search, ''), 128) || '%';
BEGIN
  IF auth.uid() IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_request_kind NOT IN ('all', 'withdrawal', 'deposit')
     OR p_status NOT IN (
       'all', 'pending', 'approved', 'declined', 'processing',
       'completed', 'failed', 'verified', 'rejected'
     ) THEN
    RAISE EXCEPTION 'Invalid backend filter.';
  END IF;

  RETURN QUERY
  WITH requests AS (
    SELECT
      'withdrawal'::text AS kind,
      request.id,
      request.user_id,
      COALESCE(
        NULLIF(account.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(account.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(account.email, '@', 1), ''),
        'Unknown'
      ) AS name,
      account.email,
      request.asset,
      request.amount,
      request.network,
      request.destination_address,
      request.fee_amount,
      request.net_amount,
      request.status,
      request.created_at,
      request.updated_at,
      request.admin_user_id,
      COALESCE(
        NULLIF(admin.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(admin.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(admin.email, '@', 1), ''),
        ''
      ) AS admin_name,
      admin.email AS admin_email,
      request.decline_reason
    FROM public.withdrawal_requests AS request
    JOIN auth.users AS account ON account.id = request.user_id
    LEFT JOIN auth.users AS admin ON admin.id = request.admin_user_id
    UNION ALL
    SELECT
      'deposit'::text,
      request.id,
      request.user_id,
      COALESCE(
        NULLIF(account.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(account.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(account.email, '@', 1), ''),
        'Unknown'
      ),
      account.email,
      request.asset,
      request.amount,
      NULL::text,
      NULL::text,
      request.fee_amount,
      request.net_amount,
      request.status,
      request.created_at,
      request.updated_at,
      request.reviewed_by,
      COALESCE(
        NULLIF(admin.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(admin.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(admin.email, '@', 1), ''),
        ''
      ),
      admin.email,
      request.review_reason
    FROM public.deposit_requests AS request
    JOIN auth.users AS account ON account.id = request.user_id
    LEFT JOIN auth.users AS admin ON admin.id = request.reviewed_by
  )
  SELECT
    requests.kind,
    requests.id,
    requests.user_id,
    requests.name,
    requests.email,
    requests.asset,
    requests.amount,
    requests.network,
    requests.destination_address,
    requests.fee_amount,
    requests.net_amount,
    requests.status,
    requests.created_at,
    requests.updated_at,
    requests.admin_user_id,
    requests.admin_name,
    requests.admin_email,
    requests.decline_reason
  FROM requests
  WHERE (p_request_kind = 'all' OR requests.kind = p_request_kind)
    AND (p_status = 'all' OR requests.status = p_status)
    AND (
      COALESCE(p_search, '') = ''
      OR requests.name ILIKE v_search
      OR requests.email ILIKE v_search
      OR requests.user_id::text ILIKE v_search
      OR requests.asset ILIKE v_search
      OR COALESCE(requests.network, '') ILIKE v_search
      OR COALESCE(requests.destination_address, '') ILIKE v_search
    )
  ORDER BY requests.created_at DESC, requests.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_backend_history(
  p_request_kind text DEFAULT 'all',
  p_search text DEFAULT '',
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  action_id uuid,
  request_kind text,
  request_id uuid,
  action text,
  user_id uuid,
  user_name text,
  asset text,
  amount numeric,
  network text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_search text := '%' || left(COALESCE(p_search, ''), 128) || '%';
BEGIN
  IF auth.uid() IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  RETURN QUERY
  WITH history AS (
    SELECT
      event.action_id,
      event.request_kind,
      event.request_id,
      event.action,
      COALESCE(request.user_id, deposit.user_id) AS user_id,
      COALESCE(
        NULLIF(account.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(account.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(account.email, '@', 1), ''),
        'Unknown'
      ) AS user_name,
      COALESCE(request.asset, deposit.asset) AS asset,
      COALESCE(request.amount, deposit.amount) AS amount,
      request.network,
      event.actor_user_id,
      COALESCE(
        NULLIF(actor.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(actor.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(actor.email, '@', 1), ''),
        ''
      ) AS actor_name,
      actor.email AS actor_email,
      event.details ->> 'reason' AS reason,
      event.created_at
    FROM public.financial_request_events AS event
    LEFT JOIN public.withdrawal_requests AS request
      ON event.request_kind = 'withdrawal' AND request.id = event.request_id
    LEFT JOIN public.deposit_requests AS deposit
      ON event.request_kind = 'deposit' AND deposit.id = event.request_id
    LEFT JOIN auth.users AS account
      ON account.id = COALESCE(request.user_id, deposit.user_id)
    LEFT JOIN auth.users AS actor ON actor.id = event.actor_user_id
    WHERE event.request_kind IN ('withdrawal', 'deposit')
  )
  SELECT
    history.action_id,
    history.request_kind,
    history.request_id,
    history.action,
    history.user_id,
    history.user_name,
    history.asset,
    history.amount,
    history.network,
    history.actor_user_id,
    history.actor_name,
    history.actor_email,
    history.reason,
    history.created_at
  FROM history
  WHERE (p_request_kind = 'all' OR history.request_kind = p_request_kind)
    AND (
      COALESCE(p_search, '') = ''
      OR history.user_name ILIKE v_search
      OR COALESCE(history.actor_name, '') ILIKE v_search
      OR COALESCE(history.actor_email, '') ILIKE v_search
      OR COALESCE(history.user_id::text, '') ILIKE v_search
      OR COALESCE(history.asset, '') ILIKE v_search
      OR COALESCE(history.network, '') ILIKE v_search
      OR COALESCE(history.reason, '') ILIKE v_search
    )
  ORDER BY history.created_at DESC, history.request_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_backend_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  RETURN jsonb_build_object(
    'pending_withdrawals', (
      SELECT count(*) FROM public.withdrawal_requests WHERE status = 'pending'
    ),
    'pending_deposits', (
      SELECT count(*) FROM public.deposit_requests WHERE status = 'pending'
    ),
    'processing_requests', (
      SELECT count(*) FROM public.withdrawal_requests WHERE status = 'processing'
    ),
    'recent_decisions', (
      SELECT count(*) FROM public.financial_request_events
      WHERE action IN (
        'withdrawal_approved', 'withdrawal_declined',
        'deposit_approved', 'deposit_declined'
      )
        AND created_at >= now() - interval '7 days'
    )
  );
END;
$function$;

ALTER FUNCTION public.submit_withdrawal_request(text,text,text,numeric,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.create_deposit_request(text,numeric,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.approve_withdrawal_request(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.decline_withdrawal_request(uuid,text,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.approve_deposit_request(uuid,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.decline_deposit_request(uuid,text,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.get_backend_requests(text,text,text,integer,integer)
  OWNER TO postgres;
ALTER FUNCTION public.get_backend_history(text,text,integer)
  OWNER TO postgres;
ALTER FUNCTION public.get_backend_overview()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION
  public.submit_withdrawal_request(text,text,text,numeric,uuid),
  public.create_deposit_request(text,numeric,uuid),
  public.approve_withdrawal_request(uuid,uuid),
  public.decline_withdrawal_request(uuid,text,uuid),
  public.approve_deposit_request(uuid,uuid),
  public.decline_deposit_request(uuid,text,uuid),
  public.get_backend_requests(text,text,text,integer,integer),
  public.get_backend_history(text,text,integer),
  public.get_backend_overview()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.submit_withdrawal_request(text,text,text,numeric,uuid),
  public.create_deposit_request(text,numeric,uuid),
  public.approve_withdrawal_request(uuid,uuid),
  public.decline_withdrawal_request(uuid,text,uuid),
  public.approve_deposit_request(uuid,uuid),
  public.decline_deposit_request(uuid,text,uuid),
  public.get_backend_requests(text,text,text,integer,integer),
  public.get_backend_history(text,text,integer),
  public.get_backend_overview()
  TO authenticated;

COMMIT;
