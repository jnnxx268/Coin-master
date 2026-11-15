BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.wallet_balances') IS NULL
     OR to_regclass('public.ledger_entries') IS NULL
     OR to_regclass('public.transactions') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION
      'Apply the existing CoinMaster accounting and user-data migrations first';
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.wallet_balances'::regclass
  ) OR NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.transactions'::regclass
  ) THEN
    RAISE EXCEPTION
      'Wallet and transaction row-level security must be enabled';
  END IF;
END;
$preflight$;

CREATE TABLE public.withdrawal_network_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL CHECK (
    asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
  ),
  network text NOT NULL,
  fee_amount numeric NOT NULL CHECK (
    fee_amount >= 0
    AND fee_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset, network)
);

CREATE TABLE public.deposit_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL CHECK (
    asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
  ),
  network text NOT NULL,
  address text NOT NULL CHECK (length(btrim(address)) BETWEEN 8 AND 512),
  provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX deposit_destinations_scope_asset_network_idx
  ON public.deposit_destinations (
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    asset,
    network
  );

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  asset text NOT NULL CHECK (
    asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
  ),
  amount numeric NOT NULL CHECK (
    amount > 0
    AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  network text NOT NULL,
  destination_address text NOT NULL
    CHECK (length(btrim(destination_address)) BETWEEN 8 AND 512),
  fee_amount numeric NOT NULL CHECK (
    fee_amount >= 0
    AND fee_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  net_amount numeric NOT NULL CHECK (
    net_amount > 0
    AND net_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'processing', 'completed')),
  request_payload jsonb NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decline_reason text,
  provider text,
  provider_reference text,
  provider_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (fee_amount < amount),
  CHECK (net_amount = amount - fee_amount),
  CHECK (
    (status <> 'declined')
    OR (admin_user_id IS NOT NULL AND decided_at IS NOT NULL
        AND length(btrim(COALESCE(decline_reason, ''))) > 0)
  ),
  CHECK (
    (provider IS NULL AND provider_reference IS NULL
     AND provider_verified_at IS NULL)
    OR (provider IS NOT NULL AND provider_reference IS NOT NULL
        AND provider_verified_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX withdrawal_provider_reference_unique
  ON public.withdrawal_requests (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX withdrawal_requests_status_created_idx
  ON public.withdrawal_requests (status, created_at DESC, id DESC);
CREATE INDEX withdrawal_requests_user_created_idx
  ON public.withdrawal_requests (user_id, created_at DESC, id DESC);

CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  asset text NOT NULL CHECK (
    asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
  ),
  amount numeric NOT NULL CHECK (
    amount > 0
    AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
  ),
  network text NOT NULL,
  destination_address text NOT NULL
    CHECK (length(btrim(destination_address)) BETWEEN 8 AND 512),
  provider text,
  provider_reference text,
  provider_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_reason text,
  request_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (provider IS NULL AND provider_reference IS NULL
     AND provider_verified_at IS NULL)
    OR (provider IS NOT NULL AND provider_reference IS NOT NULL
        AND provider_verified_at IS NOT NULL)
  ),
  CHECK ((status <> 'verified') OR provider_verified_at IS NOT NULL),
  CHECK ((status <> 'completed') OR (
    provider_verified_at IS NOT NULL
    AND reviewed_by IS NOT NULL
    AND reviewed_at IS NOT NULL
  )),
  CHECK ((status <> 'rejected') OR (
    reviewed_by IS NOT NULL
    AND reviewed_at IS NOT NULL
    AND length(btrim(COALESCE(review_reason, ''))) > 0
  ))
);

CREATE UNIQUE INDEX deposit_provider_reference_unique
  ON public.deposit_requests (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX deposit_requests_status_created_idx
  ON public.deposit_requests (status, created_at DESC, id DESC);
CREATE INDEX deposit_requests_user_created_idx
  ON public.deposit_requests (user_id, created_at DESC, id DESC);

CREATE TABLE public.financial_request_events (
  action_id uuid PRIMARY KEY,
  request_kind text NOT NULL
    CHECK (request_kind IN ('withdrawal', 'deposit', 'fee_config')),
  request_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_request_events_request_created_idx
  ON public.financial_request_events
    (request_kind, request_id, created_at DESC);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS request_kind text,
  ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS request_kind text,
  ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX transactions_request_unique
  ON public.transactions (request_kind, request_id)
  WHERE request_kind IS NOT NULL AND request_id IS NOT NULL;
CREATE UNIQUE INDEX ledger_request_entry_unique
  ON public.ledger_entries (request_kind, request_id, entry_type)
  WHERE request_kind IS NOT NULL AND request_id IS NOT NULL;

ALTER TABLE public.withdrawal_network_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_request_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.withdrawal_network_fees,
  public.deposit_destinations,
  public.withdrawal_requests,
  public.deposit_requests,
  public.financial_request_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.withdrawal_requests,
  public.deposit_requests TO authenticated;

CREATE POLICY withdrawal_requests_select_owner
  ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY deposit_requests_select_owner
  ON public.deposit_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.get_withdrawal_network_fees()
RETURNS TABLE (
  asset text,
  network text,
  fee_amount numeric,
  source_url text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  RETURN QUERY
  SELECT fee.asset, fee.network, fee.fee_amount, fee.source_url, fee.updated_at
  FROM public.withdrawal_network_fees AS fee
  WHERE fee.active
  ORDER BY fee.asset, fee.network;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_deposit_destinations()
RETURNS TABLE (
  asset text,
  network text,
  address text,
  provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (destination.asset, destination.network)
    destination.asset,
    destination.network,
    destination.address,
    destination.provider
  FROM public.deposit_destinations AS destination
  WHERE destination.active
    AND (destination.user_id IS NULL OR destination.user_id = auth.uid())
  ORDER BY destination.asset, destination.network,
    (destination.user_id = auth.uid()) DESC NULLS LAST;
END;
$function$;

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
  v_fee numeric;
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
  IF p_network IS NULL OR length(btrim(p_network)) NOT BETWEEN 1 AND 80
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
      SELECT 1
      FROM public.financial_request_events AS event
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
        'fee_amount', v_request.fee_amount,
        'net_amount', v_request.net_amount
      );
    END IF;
    RAISE EXCEPTION 'The prior withdrawal request has no completed result.';
  END IF;

  SELECT fee.fee_amount INTO v_fee
  FROM public.withdrawal_network_fees AS fee
  WHERE fee.asset = p_asset
    AND fee.network = p_network
    AND fee.active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal network is unavailable.';
  END IF;
  IF v_fee >= p_amount THEN
    RAISE EXCEPTION 'The amount must be greater than the network fee.';
  END IF;

  INSERT INTO public.withdrawal_requests (
    user_id,
    idempotency_key,
    asset,
    amount,
    network,
    destination_address,
    fee_amount,
    net_amount,
    request_payload
  )
  VALUES (
    v_actor,
    p_idempotency_key,
    p_asset,
    p_amount,
    p_network,
    btrim(p_destination_address),
    v_fee,
    p_amount - v_fee,
    v_payload
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not resolve the withdrawal request.';
  END IF;
  IF v_request.request_payload <> v_payload THEN
    RAISE EXCEPTION
      'Request ID was already used with different withdrawal details.';
  END IF;
  IF v_inserted = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.financial_request_events AS event
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
        'fee_amount', v_request.fee_amount,
        'net_amount', v_request.net_amount
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
    user_id, amount, currency, type, status, request_kind, request_id
  )
  VALUES (
    v_actor, p_amount, p_asset, 'withdrawal', 'pending', 'withdrawal', v_request.id
  );
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_idempotency_key,
    'withdrawal',
    v_request.id,
    v_actor,
    'withdrawal_submitted',
    v_payload || jsonb_build_object('fee_amount', v_fee, 'net_amount', p_amount - v_fee)
  );

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', 'pending',
    'amount', p_amount,
    'asset', p_asset,
    'fee_amount', v_fee,
    'net_amount', p_amount - v_fee,
    'available_balance', v_new_balance
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_deposit_request(
  p_asset text,
  p_network text,
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
  v_destination public.deposit_destinations%ROWTYPE;
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

  v_payload := jsonb_build_object(
    'asset', p_asset,
    'network', p_network,
    'amount', p_amount
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
        'network', v_request.network,
        'address', v_request.destination_address
      );
    END IF;
    RAISE EXCEPTION 'The prior deposit request has no completed result.';
  END IF;

  SELECT * INTO v_destination
  FROM public.deposit_destinations AS destination
  WHERE destination.asset = p_asset
    AND destination.network = p_network
    AND destination.active
    AND (destination.user_id IS NULL OR destination.user_id = v_actor)
  ORDER BY (destination.user_id = v_actor) DESC NULLS LAST
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit provider is unavailable for this asset and network.';
  END IF;

  INSERT INTO public.deposit_requests (
    user_id,
    idempotency_key,
    asset,
    amount,
    network,
    destination_address,
    request_payload
  )
  VALUES (
    v_actor,
    p_idempotency_key,
    p_asset,
    p_amount,
    p_network,
    v_destination.address,
    v_payload
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
        'network', v_request.network,
        'address', v_request.destination_address
      );
    END IF;
    RAISE EXCEPTION 'The prior deposit request has no completed result.';
  END IF;

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
    'asset', v_request.asset,
    'amount', v_request.amount,
    'network', v_request.network,
    'address', v_request.destination_address
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.configure_deposit_destination(
  p_user_id uuid,
  p_asset text,
  p_network text,
  p_address text,
  p_provider text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted deposit provider access required.';
  END IF;
  IF p_asset IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
     OR p_network IS NULL
     OR length(btrim(p_network)) NOT BETWEEN 1 AND 80
     OR p_address IS NULL
     OR length(btrim(p_address)) NOT BETWEEN 8 AND 512
     OR p_provider IS NULL
     OR length(btrim(p_provider)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Deposit destination configuration is invalid.';
  END IF;

  INSERT INTO public.deposit_destinations (
    user_id, asset, network, address, provider, active, updated_at
  )
  VALUES (
    p_user_id, p_asset, btrim(p_network), btrim(p_address),
    btrim(p_provider), true, clock_timestamp()
  )
  ON CONFLICT (
    (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    asset,
    network
  )
  DO UPDATE SET
    address = EXCLUDED.address,
    provider = EXCLUDED.provider,
    active = true,
    updated_at = clock_timestamp();
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_deposit_request(
  p_request_id uuid,
  p_provider text,
  p_provider_reference text,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.deposit_requests%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted deposit provider access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 120
     OR p_provider_reference IS NULL
     OR length(btrim(p_provider_reference)) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Deposit verification details are invalid.';
  END IF;

  SELECT * INTO v_request
  FROM public.deposit_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit request was not found.';
  END IF;

  v_payload := jsonb_build_object(
    'provider', btrim(p_provider),
    'provider_reference', btrim(p_provider_reference)
  );
  IF v_request.status = 'verified' AND
     v_request.provider = btrim(p_provider) AND
     v_request.provider_reference = btrim(p_provider_reference) THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events
      WHERE action_id = p_action_id
        AND request_kind = 'deposit'
        AND request_id = p_request_id
        AND action = 'deposit_verified'
        AND details = v_payload
    ) THEN
      RETURN jsonb_build_object('request_id', p_request_id, 'status', 'verified');
    END IF;
    RAISE EXCEPTION 'Deposit request was already verified.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending deposit requests can be verified.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;

  UPDATE public.deposit_requests
  SET provider = btrim(p_provider),
      provider_reference = btrim(p_provider_reference),
      provider_verified_at = clock_timestamp(),
      status = 'verified',
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, action, details
  )
  VALUES (p_action_id, 'deposit', p_request_id, 'deposit_verified', v_payload);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'verified');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_withdrawal_network_fee(
  p_asset text,
  p_network text,
  p_fee_amount numeric,
  p_source_url text,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_fee_id uuid;
  v_payload jsonb;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_action_id IS NULL THEN
    RAISE EXCEPTION 'An action ID is required.';
  END IF;
  IF p_asset IS NULL
     OR p_network IS NULL
     OR p_asset NOT IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
     OR NOT (
       (p_asset = 'BTC' AND p_network = 'Bitcoin')
       OR (p_asset = 'ETH' AND p_network = 'Ethereum (ERC20)')
       OR (p_asset = 'USDT' AND p_network IN ('TRON (TRC20)', 'Ethereum (ERC20)'))
       OR (p_asset = 'USDC' AND p_network IN ('Ethereum (ERC20)', 'Solana'))
       OR (p_asset = 'LTC' AND p_network = 'Litecoin')
       OR (p_asset = 'BNB' AND p_network = 'BNB Smart Chain (BEP20)')
       OR (p_asset = 'SOL' AND p_network = 'Solana')
     )
     OR p_fee_amount IS NULL
     OR p_fee_amount < 0
     OR p_fee_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_source_url IS NULL OR p_source_url !~ '^https://'
     OR length(p_source_url) > 2048 THEN
    RAISE EXCEPTION 'Network fee configuration is invalid.';
  END IF;

  v_payload := jsonb_build_object(
    'asset', p_asset,
    'network', p_network,
    'fee_amount', p_fee_amount,
    'source_url', p_source_url
  );
  IF EXISTS (
    SELECT 1 FROM public.financial_request_events
    WHERE action_id = p_action_id
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_request_events
      WHERE action_id = p_action_id
        AND request_kind = 'fee_config'
        AND action = 'withdrawal_fee_configured'
        AND actor_user_id = v_actor
        AND details = v_payload
    ) THEN
      RETURN jsonb_build_object('success', true, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;

  INSERT INTO public.withdrawal_network_fees (
    asset, network, fee_amount, source_url, active, updated_by, updated_at
  )
  VALUES (
    p_asset, p_network, p_fee_amount, p_source_url, true, v_actor, clock_timestamp()
  )
  ON CONFLICT (asset, network)
  DO UPDATE SET
    fee_amount = EXCLUDED.fee_amount,
    source_url = EXCLUDED.source_url,
    active = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = clock_timestamp()
  RETURNING id INTO v_fee_id;

  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'fee_config', v_fee_id, v_actor,
    'withdrawal_fee_configured', v_payload
  );
  RETURN jsonb_build_object('success', true, 'fee_id', v_fee_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_withdrawal_fee_active(
  p_asset text,
  p_network text,
  p_active boolean,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_fee_id uuid;
  v_payload jsonb;
BEGIN
  IF v_actor IS NULL OR
     COALESCE((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF p_action_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'A valid action is required.';
  END IF;
  v_payload := jsonb_build_object(
    'asset', p_asset,
    'network', p_network,
    'active', p_active
  );
  IF EXISTS (
    SELECT 1 FROM public.financial_request_events
    WHERE action_id = p_action_id
      AND request_kind = 'fee_config'
      AND actor_user_id = v_actor
      AND action = 'withdrawal_fee_toggled'
      AND details = v_payload
  ) THEN
    RETURN jsonb_build_object('success', true, 'replayed', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;

  UPDATE public.withdrawal_network_fees
  SET active = p_active,
      updated_by = v_actor,
      updated_at = clock_timestamp()
  WHERE asset = p_asset AND network = p_network
  RETURNING id INTO v_fee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Network fee configuration was not found.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'fee_config', v_fee_id, v_actor,
    'withdrawal_fee_toggled', v_payload
  );
  RETURN jsonb_build_object('success', true, 'fee_id', v_fee_id);
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
  v_payload jsonb := '{}'::jsonb;
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
  IF v_request.status = 'approved'
     AND v_request.admin_user_id = v_actor
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'withdrawal_approved'
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'approved');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be approved.';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'approved',
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
  SET status = 'approved'
  WHERE request_kind = 'withdrawal'
    AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The withdrawal transaction record is missing.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'withdrawal', p_request_id, v_actor,
    'withdrawal_approved', v_payload
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'approved');
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
  IF v_request.status = 'declined'
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
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'declined');
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
      AND entry_type = 'withdrawal_reserved'
  ) THEN
    RAISE EXCEPTION 'The reserved withdrawal ledger entry is missing.';
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
  SET status = 'declined',
      admin_user_id = v_actor,
      decided_at = clock_timestamp(),
      decline_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.transactions
  SET status = 'declined'
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
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'declined');
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_withdrawal_processing(
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
  IF v_request.status = 'processing' AND
     EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'withdrawal_processing'
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'processing');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved withdrawals can enter processing.';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'processing',
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.transactions
  SET status = 'processing'
  WHERE request_kind = 'withdrawal' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The withdrawal transaction record is missing.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, actor_user_id, action, details
  )
  VALUES (
    p_action_id, 'withdrawal', p_request_id, v_actor,
    'withdrawal_processing', '{}'::jsonb
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'processing');
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_verified_withdrawal(
  p_request_id uuid,
  p_provider text,
  p_provider_reference text,
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted withdrawal provider access required.';
  END IF;
  IF p_request_id IS NULL OR p_action_id IS NULL
     OR p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 120
     OR p_provider_reference IS NULL
     OR length(btrim(p_provider_reference)) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'Withdrawal verification details are invalid.';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request was not found.';
  END IF;
  v_payload := jsonb_build_object(
    'provider', btrim(p_provider),
    'provider_reference', btrim(p_provider_reference)
  );
  IF v_request.status = 'completed'
     AND v_request.provider = btrim(p_provider)
     AND v_request.provider_reference = btrim(p_provider_reference)
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'withdrawal'
         AND request_id = p_request_id
         AND action = 'withdrawal_completed'
         AND details = v_payload
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'processing' THEN
    RAISE EXCEPTION 'Only processing withdrawals can be completed.';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'completed',
      provider = btrim(p_provider),
      provider_reference = btrim(p_provider_reference),
      provider_verified_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.transactions
  SET status = 'completed'
  WHERE request_kind = 'withdrawal' AND request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The withdrawal transaction record is missing.';
  END IF;
  INSERT INTO public.financial_request_events (
    action_id, request_kind, request_id, action, details
  )
  VALUES (
    p_action_id, 'withdrawal', p_request_id,
    'withdrawal_completed', v_payload
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_verified_deposit(
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
  v_payload jsonb := '{}'::jsonb;
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
         AND action = 'deposit_credited'
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'completed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status <> 'verified'
     OR v_request.provider_verified_at IS NULL
     OR v_request.provider_reference IS NULL THEN
    RAISE EXCEPTION 'Only provider-verified deposits can be credited.';
  END IF;

  INSERT INTO public.wallet_balances (user_id, asset, balance)
  VALUES (v_request.user_id, v_request.asset, v_request.amount)
  ON CONFLICT (user_id, asset)
  DO UPDATE SET
    balance = public.wallet_balances.balance + EXCLUDED.balance,
    updated_at = clock_timestamp();
  INSERT INTO public.ledger_entries (
    user_id, asset, amount, entry_type, request_kind, request_id
  )
  VALUES (
    v_request.user_id, v_request.asset, v_request.amount,
    'deposit_credit', 'deposit', p_request_id
  );
  INSERT INTO public.transactions (
    user_id, amount, currency, type, status, request_kind, request_id
  )
  VALUES (
    v_request.user_id, v_request.amount, v_request.asset,
    'deposit', 'completed', 'deposit', p_request_id
  );
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
    'deposit_credited', jsonb_build_object(
      'provider', v_request.provider,
      'provider_reference', v_request.provider_reference
    )
  );
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'completed',
    'amount', v_request.amount,
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
  IF v_request.status = 'rejected'
     AND v_request.reviewed_by = v_actor
     AND v_request.review_reason = btrim(p_reason)
     AND EXISTS (
       SELECT 1 FROM public.financial_request_events
       WHERE action_id = p_action_id
         AND request_kind = 'deposit'
         AND request_id = p_request_id
         AND actor_user_id = v_actor
         AND action = 'deposit_rejected'
         AND details = v_payload
     ) THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected');
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_request_events WHERE action_id = p_action_id) THEN
    RAISE EXCEPTION 'Action ID was already used.';
  END IF;
  IF v_request.status NOT IN ('pending', 'verified') THEN
    RAISE EXCEPTION 'Only pending or verified deposits can be declined.';
  END IF;

  UPDATE public.deposit_requests
  SET status = 'rejected',
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
    'deposit_rejected', v_payload
  );
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected');
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
  decision_reason text,
  provider text,
  provider_reference text,
  provider_verified_at timestamptz
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
       'completed', 'verified', 'rejected'
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
      request.decline_reason,
      request.provider,
      request.provider_reference,
      request.provider_verified_at
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
      request.network,
      request.destination_address,
      0::numeric,
      request.amount,
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
      request.review_reason,
      request.provider,
      request.provider_reference,
      request.provider_verified_at
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
    requests.decline_reason,
    requests.provider,
    requests.provider_reference,
    requests.provider_verified_at
  FROM requests
  WHERE (p_request_kind = 'all' OR requests.kind = p_request_kind)
    AND (p_status = 'all' OR requests.status = p_status)
    AND (
      COALESCE(p_search, '') = ''
      OR requests.name ILIKE v_search
      OR requests.email ILIKE v_search
      OR requests.user_id::text ILIKE v_search
      OR requests.asset ILIKE v_search
      OR requests.network ILIKE v_search
      OR requests.destination_address ILIKE v_search
      OR COALESCE(requests.provider_reference, '') ILIKE v_search
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
  provider_reference text,
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
      request.user_id,
      COALESCE(
        NULLIF(account.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(account.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(account.email, '@', 1), ''),
        'Unknown'
      ) AS user_name,
      COALESCE(request.asset, deposit.asset) AS asset,
      COALESCE(request.amount, deposit.amount) AS amount,
      COALESCE(request.network, deposit.network) AS network,
      event.actor_user_id,
      COALESCE(
        NULLIF(actor.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(actor.raw_user_meta_data ->> 'name', ''),
        NULLIF(split_part(actor.email, '@', 1), ''),
        ''
      ) AS actor_name,
      actor.email AS actor_email,
      event.details ->> 'reason' AS reason,
      event.details ->> 'provider_reference' AS provider_reference,
      event.details,
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
    history.provider_reference,
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
      OR COALESCE(history.provider_reference, '') ILIKE v_search
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
      SELECT count(*) FROM public.deposit_requests WHERE status IN ('pending', 'verified')
    ),
    'processing_requests', (
      SELECT count(*) FROM public.withdrawal_requests WHERE status = 'processing'
    ),
    'recent_decisions', (
      SELECT count(*) FROM public.financial_request_events
      WHERE action IN ('withdrawal_approved', 'withdrawal_declined', 'deposit_credited', 'deposit_rejected')
        AND created_at >= now() - interval '7 days'
    )
  );
END;
$function$;

DO $function_privileges$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_withdrawal_network_fees()',
    'public.get_deposit_destinations()',
    'public.submit_withdrawal_request(text,text,text,numeric,uuid)',
    'public.create_deposit_request(text,text,numeric,uuid)',
    'public.configure_deposit_destination(uuid,text,text,text,text)',
    'public.verify_deposit_request(uuid,text,text,uuid)',
    'public.set_withdrawal_network_fee(text,text,numeric,text,uuid)',
    'public.set_withdrawal_fee_active(text,text,boolean,uuid)',
    'public.approve_withdrawal_request(uuid,uuid)',
    'public.decline_withdrawal_request(uuid,text,uuid)',
    'public.mark_withdrawal_processing(uuid,uuid)',
    'public.complete_verified_withdrawal(uuid,text,text,uuid)',
    'public.credit_verified_deposit(uuid,uuid)',
    'public.decline_deposit_request(uuid,text,uuid)',
    'public.get_backend_requests(text,text,text,integer,integer)',
    'public.get_backend_history(text,text,integer)',
    'public.get_backend_overview()'
  ]
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', function_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', function_signature);
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_withdrawal_network_fees()',
    'public.get_deposit_destinations()',
    'public.submit_withdrawal_request(text,text,text,numeric,uuid)',
    'public.create_deposit_request(text,text,numeric,uuid)',
    'public.set_withdrawal_network_fee(text,text,numeric,text,uuid)',
    'public.set_withdrawal_fee_active(text,text,boolean,uuid)',
    'public.approve_withdrawal_request(uuid,uuid)',
    'public.decline_withdrawal_request(uuid,text,uuid)',
    'public.mark_withdrawal_processing(uuid,uuid)',
    'public.credit_verified_deposit(uuid,uuid)',
    'public.decline_deposit_request(uuid,text,uuid)',
    'public.get_backend_requests(text,text,text,integer,integer)',
    'public.get_backend_history(text,text,integer)',
    'public.get_backend_overview()'
  ]
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;

  GRANT EXECUTE ON FUNCTION
    public.configure_deposit_destination(uuid,text,text,text,text),
    public.verify_deposit_request(uuid,text,text,uuid),
    public.complete_verified_withdrawal(uuid,text,text,uuid)
    TO service_role;
END;
$function_privileges$;

COMMIT;
