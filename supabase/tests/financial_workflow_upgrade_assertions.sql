\set ON_ERROR_STOP on

DO $assert_legacy_financial_data_preserved$
BEGIN
  IF (SELECT status FROM public.withdrawal_requests
      WHERE id = 'a1000000-0000-0000-0000-000000000001') <> 'approved'
     OR (SELECT status FROM public.withdrawal_requests
         WHERE id = 'a1000000-0000-0000-0000-000000000002') <> 'processing'
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '81000000-0000-0000-0000-000000000008'
           AND asset = 'BTC') <> 1000
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE request_kind = 'withdrawal'
           AND request_id IN (
             'a1000000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000002'
           )
           AND entry_type = 'withdrawal_reserved') <> 2
     OR (SELECT count(*) FROM public.transactions
         WHERE request_kind = 'withdrawal'
           AND request_id IN (
             'a1000000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000002'
           )
           AND status = 'processing') <> 2 THEN
    RAISE EXCEPTION 'Migration changed historical withdrawal states or balances';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.withdrawal_network_fees
    WHERE id = 'a0000000-0000-0000-0000-000000000001'
      AND fee_amount = 1.25
      AND source_url = 'https://fees.example.test/bitcoin'
  )
     OR NOT EXISTS (
       SELECT 1 FROM public.deposit_destinations
       WHERE id = 'a0000000-0000-0000-0000-000000000002'
         AND address = 'legacy-deposit-address'
         AND provider = 'legacy-provider'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.deposit_requests
       WHERE id = 'a3000000-0000-0000-0000-000000000001'
         AND status = 'verified'
         AND provider = 'legacy-provider'
         AND provider_reference = 'legacy-reference-1'
         AND fee_amount IS NULL
         AND net_amount IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.transactions
       WHERE request_kind = 'deposit'
         AND request_id = 'a3000000-0000-0000-0000-000000000001'
         AND status = 'processing'
         AND amount = 100
         AND gross_amount IS NULL
         AND fee_amount IS NULL
         AND net_amount IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.deposit_requests
       WHERE id = 'a3000000-0000-0000-0000-000000000002'
         AND status = 'pending'
         AND fee_amount IS NULL
         AND net_amount IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.transactions
       WHERE request_kind = 'deposit'
         AND request_id = 'a3000000-0000-0000-0000-000000000002'
     ) THEN
    RAISE EXCEPTION 'Migration did not preserve configuration, references, or unlinked transaction state';
  END IF;
END;
$assert_legacy_financial_data_preserved$;

DO $assert_financial_rpc_overloads$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.create_deposit_request(text,text,numeric,uuid)')
       IS NOT NULL
     OR has_function_privilege(
       'anon',
       'public.create_deposit_request(text,numeric,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'The obsolete four-argument deposit RPC remains callable';
  END IF;

  IF to_regprocedure('public.create_deposit_request(text,numeric,uuid)')
       IS NULL THEN
    RAISE EXCEPTION 'The secure three-argument deposit RPC is missing';
  END IF;
  SELECT pg_get_functiondef(
    'public.create_deposit_request(text,numeric,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%SECURITY DEFINER%'
     OR v_definition NOT ILIKE '%search_path TO ''''%' THEN
    RAISE EXCEPTION 'The replacement deposit RPC has unsafe function settings';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.create_deposit_request(text,numeric,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.create_deposit_request(text,numeric,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Deposit RPC execute grants are incorrect';
  END IF;
END;
$assert_financial_rpc_overloads$;

DO $assert_financial_rpc_security$
DECLARE
  v_function_count integer;
BEGIN
  SELECT count(*) INTO v_function_count
  FROM pg_proc AS function
  JOIN pg_namespace AS namespace ON namespace.oid = function.pronamespace
  WHERE namespace.nspname = 'public'
    AND function.proname = ANY (ARRAY[
      'submit_withdrawal_request',
      'create_deposit_request',
      'approve_withdrawal_request',
      'decline_withdrawal_request',
      'approve_deposit_request',
      'decline_deposit_request',
      'get_backend_requests',
      'get_backend_history',
      'get_backend_overview'
    ])
    AND function.prosecdef
    AND function.proconfig @> ARRAY['search_path=""']::text[]
    AND has_function_privilege('authenticated', function.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', function.oid, 'EXECUTE');

  IF v_function_count <> 9 THEN
    RAISE EXCEPTION
      'A financial RPC is missing SECURITY DEFINER, an empty search_path, or least-privilege EXECUTE grants';
  END IF;
END;
$assert_financial_rpc_security$;

DO $assert_user_transaction_history_privileges$
BEGIN
  IF NOT has_column_privilege(
       'authenticated', 'public.transactions', 'gross_amount', 'SELECT'
     )
     OR NOT has_column_privilege(
       'authenticated', 'public.transactions', 'fee_amount', 'SELECT'
     )
     OR NOT has_column_privilege(
       'authenticated', 'public.transactions', 'net_amount', 'SELECT'
     )
     OR has_column_privilege(
       'authenticated', 'public.deposit_requests', 'reviewed_by', 'SELECT'
     )
     OR has_column_privilege(
       'authenticated', 'public.deposit_requests', 'review_reason', 'SELECT'
     ) THEN
    RAISE EXCEPTION 'Transaction detail grants expose the wrong columns';
  END IF;
END;
$assert_user_transaction_history_privileges$;

SELECT 'Financial workflow upgrade assertions passed.' AS result;
