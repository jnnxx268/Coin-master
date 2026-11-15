BEGIN;

CREATE INDEX IF NOT EXISTS transactions_user_created_id_idx
  ON public.transactions (user_id, created_at DESC, id DESC);

CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL
    CHECK (length(btrim(subject)) BETWEEN 1 AND 160),
  category text NOT NULL
    CHECK (category IN ('account', 'wallet', 'transaction', 'security', 'other')),
  message text NOT NULL
    CHECK (length(btrim(message)) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_requests_user_created_id_idx
  ON public.support_requests (user_id, created_at DESC, id DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.support_requests
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  subject,
  category,
  message,
  status,
  created_at
)
  ON TABLE public.support_requests
  TO authenticated;

GRANT INSERT (user_id, subject, category, message)
  ON TABLE public.support_requests
  TO authenticated;

CREATE POLICY support_requests_select_own
  ON public.support_requests
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY support_requests_insert_own
  ON public.support_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;
