#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is required for the isolated accounting tests.' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf '%s\n' 'The Docker daemon is not available.' >&2
  exit 1
fi

container="coinmaster-accounting-test-$$"
preflight_log="/tmp/coinmaster-policy-preflight-$$.log"

cleanup() {
  docker stop "$container" >/dev/null 2>&1 || true
  rm -f "$preflight_log"
}
trap cleanup EXIT

docker run --rm --detach \
  --network none \
  --name "$container" \
  --env POSTGRES_PASSWORD=local-test-only \
  postgres:16-alpine >/dev/null

ready=false
for attempt in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != true ]]; then
  printf '%s\n' 'The disposable PostgreSQL instance did not become ready.' >&2
  exit 1
fi

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/tests/accounting_local_schema.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261018201500_secure_user_data_tables.sql

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres <<'SQL'
CREATE FUNCTION public.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
$function$;

DROP POLICY wallet_balances_select_own ON public.wallet_balances;
CREATE POLICY wallet_balances_select_own
  ON public.wallet_balances
  FOR SELECT TO authenticated
  USING (user_id = public.uid());
SQL

if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261018201500_secure_user_data_tables.sql \
  >"$preflight_log" 2>&1; then
  printf '%s\n' \
    'Unsafe policy using public.uid() unexpectedly passed the migration preflight.' \
    >&2
  exit 1
fi

if ! grep -F \
  'Expected exactly one authenticated owner SELECT policy on public.wallet_balances' \
  "$preflight_log" >/dev/null; then
  cat "$preflight_log" >&2
  exit 1
fi

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres <<'SQL'
DROP POLICY wallet_balances_select_own ON public.wallet_balances;
CREATE POLICY wallet_balances_select_own
  ON public.wallet_balances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP FUNCTION public.uid();
SQL

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261019202000_idempotent_accounting_rpcs.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261022130000_admin_asset_recipient_lookup.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261022140000_admin_send_demo_asset.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261020120000_persist_user_watchlists.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/tests/accounting_local_assertions.sql
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/tests/watchlist_local_assertions.sql

run_request() {
  local actor_id="$1"
  local recipient_email="$2"
  local asset="$3"
  local amount="$4"
  local request_id="$5"

  docker exec "$container" psql -X -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -c "BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '$actor_id', true);
        SELECT set_config('request.jwt.claims',
          '{\"sub\":\"$actor_id\",\"role\":\"authenticated\",\"app_metadata\":{\"admin\":\"false\"}}',
          true);
        SELECT public.transfer_demo_asset(
          '$recipient_email', '$asset', $amount, '$request_id'
        );
        COMMIT;"
}

run_request \
  '40000000-0000-0000-0000-000000000004' \
  reciprocal-b@example.test \
  USDT \
  1 \
  'c0000000-0000-0000-0000-000000000001' &
first_transfer=$!
run_request \
  '50000000-0000-0000-0000-000000000005' \
  reciprocal-a@example.test \
  USDT \
  1 \
  'c0000000-0000-0000-0000-000000000002' &
second_transfer=$!

wait "$first_transfer"
wait "$second_transfer"

run_request \
  '20000000-0000-0000-0000-000000000002' \
  recipient@example.test \
  BTC \
  1 \
  'e0000000-0000-0000-0000-000000000001' &
first_replay=$!
run_request \
  '20000000-0000-0000-0000-000000000002' \
  recipient@example.test \
  BTC \
  1 \
  'e0000000-0000-0000-0000-000000000001' &
second_replay=$!

wait "$first_replay"
wait "$second_replay"

run_request \
  '60000000-0000-0000-0000-000000000006' \
  overspend-recipient@example.test \
  ETH \
  7 \
  'd0000000-0000-0000-0000-000000000001' >/dev/null 2>&1 &
first_overspend=$!
run_request \
  '60000000-0000-0000-0000-000000000006' \
  overspend-recipient@example.test \
  ETH \
  7 \
  'd0000000-0000-0000-0000-000000000002' >/dev/null 2>&1 &
second_overspend=$!

first_status=0
second_status=0
wait "$first_overspend" || first_status=$?
wait "$second_overspend" || second_status=$?

if [[ "$first_status" -eq "$second_status" ]]; then
  printf '%s\n' \
    'Expected exactly one concurrent overspend request to succeed.' >&2
  exit 1
fi

docker exec -i "$container" psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 <<'SQL'
DO $assert_concurrent_transfers$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '40000000-0000-0000-0000-000000000004'
        AND asset = 'USDT') <> 10
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '50000000-0000-0000-0000-000000000005'
           AND asset = 'USDT') <> 10
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '40000000-0000-0000-0000-000000000004',
           '50000000-0000-0000-0000-000000000005'
         )
           AND entry_type IN ('transfer_sent', 'transfer_received')) <> 4 THEN
    RAISE EXCEPTION 'Reciprocal transfers were not both recorded atomically';
  END IF;

  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '20000000-0000-0000-0000-000000000002'
        AND asset = 'BTC') <> 6
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND asset = 'BTC') <> 6
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND entry_type IN ('transfer_sent', 'transfer_received')) <> 4
     OR (SELECT count(*) FROM public.transactions
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND type IN ('transfer_sent', 'transfer_received')) <> 4
     OR (SELECT count(*) FROM public.notifications
         WHERE user_id IN (
           '20000000-0000-0000-0000-000000000002',
           '30000000-0000-0000-0000-000000000003'
         )
           AND title IN ('Transfer sent', 'Transfer received')) <> 4 THEN
    RAISE EXCEPTION 'Concurrent duplicate transfer was not idempotent/atomic';
  END IF;

  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '60000000-0000-0000-0000-000000000006'
        AND asset = 'ETH') <> 3
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '70000000-0000-0000-0000-000000000007'
           AND asset = 'ETH') <> 7
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id IN (
           '60000000-0000-0000-0000-000000000006',
           '70000000-0000-0000-0000-000000000007'
         )
           AND entry_type IN ('transfer_sent', 'transfer_received')) <> 2
     OR (SELECT count(*) FROM public.transactions
         WHERE user_id IN (
           '60000000-0000-0000-0000-000000000006',
           '70000000-0000-0000-0000-000000000007'
         )
           AND type IN ('transfer_sent', 'transfer_received')) <> 2
     OR (SELECT count(*) FROM public.notifications
         WHERE user_id IN (
           '60000000-0000-0000-0000-000000000006',
           '70000000-0000-0000-0000-000000000007'
         )
           AND title IN ('Transfer sent', 'Transfer received')) <> 2 THEN
    RAISE EXCEPTION 'Concurrent overspend was not serialized safely';
  END IF;
END;
$assert_concurrent_transfers$;
SQL

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres <<'SQL'
DROP FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid);
DROP FUNCTION public.transfer_demo_asset(text, text, numeric, uuid);
DROP FUNCTION coinmaster_private.transfer_demo_asset_internal(
  text,
  text,
  numeric,
  uuid,
  boolean
);
SQL

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres \
  < supabase/migrations/20261022140000_admin_send_demo_asset.sql

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres <<'SQL'
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
  'SOL',
  5,
  'b0000000-0000-0000-0000-000000000005'
);
COMMIT;

DO $assert_legacy_admin_send$
BEGIN
  IF (SELECT balance FROM public.wallet_balances
      WHERE user_id = '10000000-0000-0000-0000-000000000001'
        AND asset = 'SOL') <> 0
     OR (SELECT balance FROM public.wallet_balances
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND asset = 'SOL') <> 5
     OR (SELECT count(*) FROM public.ledger_entries
         WHERE user_id = '30000000-0000-0000-0000-000000000003'
           AND asset = 'SOL'
           AND entry_type = 'admin_credit') <> 1 THEN
    RAISE EXCEPTION
      'Admin send compatibility path did not credit without debiting the admin';
  END IF;
END;
$assert_legacy_admin_send$;
SQL

printf '%s\n' \
  'Local accounting tests passed: auth.uid policy preflight, spoofed UID rejection, atomic credits/transfers, admin sends, authorization, sequential/concurrent idempotent replay, payload mismatch, insufficient balance, reciprocal locking, concurrent overspend.'
