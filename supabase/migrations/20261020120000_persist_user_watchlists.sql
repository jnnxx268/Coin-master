BEGIN;

CREATE TABLE public.user_watchlist_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist text[] NOT NULL DEFAULT ARRAY[]::text[],
  price_alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_watchlist_preferences_watchlist_assets_check
    CHECK (
      watchlist <@ ARRAY[
        'BTC',
        'ETH',
        'USDT',
        'USDC',
        'LTC',
        'BNB',
        'SOL'
      ]::text[]
    ),
  CONSTRAINT user_watchlist_preferences_alerts_array_check
    CHECK (jsonb_typeof(price_alerts) = 'array')
);

ALTER TABLE public.user_watchlist_preferences
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_watchlist_preferences
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_watchlist_preferences
  TO authenticated;

CREATE POLICY user_watchlist_preferences_select_own
  ON public.user_watchlist_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_watchlist_preferences_insert_own
  ON public.user_watchlist_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_watchlist_preferences_update_own
  ON public.user_watchlist_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_watchlist_preferences_delete_own
  ON public.user_watchlist_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- The client history view needs this column in addition to the existing
-- owner-scoped transaction columns granted by the security migration.
GRANT SELECT (currency)
  ON TABLE public.transactions
  TO authenticated;

COMMIT;
