-- Correct backend function email return types.

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
      account.email::text,
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
      admin.email::text AS admin_email,
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
      account.email::text,
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
      actor.email::text AS actor_email,
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
