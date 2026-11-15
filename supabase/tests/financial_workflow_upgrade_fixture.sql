\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email)
VALUES
  ('81000000-0000-0000-0000-000000000008', 'financial-user@example.test'),
  ('91000000-0000-0000-0000-000000000009', 'other-financial-user@example.test');

UPDATE public.wallet_balances
SET balance = 1000
WHERE user_id = '81000000-0000-0000-0000-000000000008'
  AND asset = 'BTC';

INSERT INTO public.withdrawal_network_fees (
  id, asset, network, fee_amount, source_url, active, updated_by
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'BTC',
  'Bitcoin',
  1.25,
  'https://fees.example.test/bitcoin',
  true,
  '81000000-0000-0000-0000-000000000008'
);

INSERT INTO public.deposit_destinations (
  id, user_id, asset, network, address, provider, active
)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000008',
  'BTC',
  'Bitcoin',
  'legacy-deposit-address',
  'legacy-provider',
  true
);

INSERT INTO public.withdrawal_requests (
  id, user_id, idempotency_key, asset, amount, network,
  destination_address, fee_amount, net_amount, status, request_payload
)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000008',
    'a2000000-0000-0000-0000-000000000001',
    'BTC', 30, 'Bitcoin', 'legacy-approved-destination', 0, 30, 'approved',
    '{"legacy_fixture":true,"amount":30}'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000008',
    'a2000000-0000-0000-0000-000000000002',
    'BTC', 40, 'Bitcoin', 'legacy-processing-destination', 0, 40, 'processing',
    '{"legacy_fixture":true,"amount":40}'
  );

INSERT INTO public.ledger_entries (
  user_id, asset, amount, entry_type, request_kind, request_id
)
VALUES
  (
    '81000000-0000-0000-0000-000000000008', 'BTC', 30,
    'withdrawal_reserved', 'withdrawal',
    'a1000000-0000-0000-0000-000000000001'
  ),
  (
    '81000000-0000-0000-0000-000000000008', 'BTC', 40,
    'withdrawal_reserved', 'withdrawal',
    'a1000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.transactions (
  user_id, amount, currency, type, status, request_kind, request_id
)
VALUES
  (
    '81000000-0000-0000-0000-000000000008', 30, 'BTC', 'withdrawal',
    'processing', 'withdrawal', 'a1000000-0000-0000-0000-000000000001'
  ),
  (
    '81000000-0000-0000-0000-000000000008', 40, 'BTC', 'withdrawal',
    'processing', 'withdrawal', 'a1000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.deposit_requests (
  id, user_id, idempotency_key, asset, amount, network,
  destination_address, provider, provider_reference, provider_verified_at,
  status, request_payload
)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000008',
  'a4000000-0000-0000-0000-000000000001',
  'BTC', 100, 'Bitcoin', 'legacy-deposit-address',
  'legacy-provider', 'legacy-reference-1', now(), 'verified',
  '{"legacy_fixture":true,"amount":100}'
);

INSERT INTO public.deposit_requests (
  id, user_id, idempotency_key, asset, amount, network,
  destination_address, status, request_payload
)
VALUES (
  'a3000000-0000-0000-0000-000000000002',
  '81000000-0000-0000-0000-000000000008',
  'a4000000-0000-0000-0000-000000000002',
  'BTC', 50, 'Bitcoin', 'legacy-deposit-address', 'pending',
  '{"legacy_fixture":true,"amount":50}'
);

INSERT INTO public.transactions (
  user_id, amount, currency, type, status, request_kind, request_id
)
VALUES (
  '81000000-0000-0000-0000-000000000008',
  100,
  'BTC',
  'deposit',
  'processing',
  'deposit',
  'a3000000-0000-0000-0000-000000000001'
);

CREATE FUNCTION public.create_deposit_request(
  p_asset text,
  p_amount numeric,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('unsafe_legacy_overload', true)
$function$;
GRANT EXECUTE ON FUNCTION public.create_deposit_request(text, numeric, uuid)
  TO anon;
