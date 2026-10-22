\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$function$;

CREATE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$function$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt()
  TO anon, authenticated, service_role;

CREATE TABLE public.wallet_balances (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL CHECK (
    asset IN ('BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL')
  ),
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  btc_balance numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  entry_type text NOT NULL,
  related_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_balances_select_own
  ON public.wallet_balances
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid() AS uid));
CREATE POLICY ledger_entries_select_own
  ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid() AS uid));
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid() AS uid));

CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.initialize_demo_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.wallet_balances (user_id, asset, balance)
  VALUES
    (NEW.id, 'BTC', 0),
    (NEW.id, 'ETH', 0),
    (NEW.id, 'USDT', 0),
    (NEW.id, 'USDC', 0),
    (NEW.id, 'LTC', 0),
    (NEW.id, 'BNB', 0),
    (NEW.id, 'SOL', 0)
  ON CONFLICT (user_id, asset) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER initialize_demo_wallets_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_demo_wallets();

GRANT ALL PRIVILEGES ON TABLE
  public.profiles,
  public.transactions,
  public.wallet_balances,
  public.ledger_entries,
  public.notifications
TO anon, authenticated;

CREATE FUNCTION public.transfer_demo_asset(text, text, numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT '{}'::jsonb
$function$;

CREATE FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT '{}'::jsonb
$function$;

GRANT EXECUTE ON FUNCTION public.transfer_demo_asset(text, text, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_credit_demo_asset(uuid, text, numeric)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user(),
  public.initialize_demo_wallets()
  TO anon, authenticated, service_role;
