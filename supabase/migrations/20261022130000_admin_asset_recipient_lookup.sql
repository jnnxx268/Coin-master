BEGIN;

CREATE OR REPLACE FUNCTION public.admin_resolve_demo_asset_recipient(
  p_identifier text,
  p_lookup_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_identifier text := btrim(p_identifier);
  v_user_id uuid;
  v_email text;
  v_matches bigint;
BEGIN
  IF v_actor IS NULL
     OR COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'admin') = 'true',
       false
     ) = false THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_identifier IS NULL OR v_identifier = '' THEN
    RAISE EXCEPTION 'A recipient identifier is required.';
  END IF;

  IF p_lookup_by = 'user_id' THEN
    IF v_identifier !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Enter a valid Supabase User ID.';
    END IF;

    SELECT u.id, u.email
      INTO v_user_id, v_email
    FROM auth.users AS u
    WHERE u.id = v_identifier::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recipient account not found.';
    END IF;
  ELSIF p_lookup_by = 'email' THEN
    SELECT count(*), min(u.id::text)::uuid, min(u.email)
      INTO v_matches, v_user_id, v_email
    FROM auth.users AS u
    WHERE lower(btrim(u.email)) = lower(v_identifier);

    IF v_matches = 0 THEN
      RAISE EXCEPTION 'Recipient account not found.';
    ELSIF v_matches > 1 THEN
      RAISE EXCEPTION
        'Recipient email is ambiguous; look up the account by Supabase User ID.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Choose email or Supabase User ID for recipient lookup.';
  END IF;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'Recipient account does not have an email address.';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'email', v_email
  );
END;
$function$;

ALTER FUNCTION public.admin_resolve_demo_asset_recipient(text, text)
  OWNER TO postgres;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_resolve_demo_asset_recipient(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.admin_resolve_demo_asset_recipient(text, text)
  TO authenticated;

DO $postflight$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.admin_resolve_demo_asset_recipient(text, text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_resolve_demo_asset_recipient(text, text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_resolve_demo_asset_recipient(text, text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'Unexpected effective execution privileges on admin recipient lookup';
  END IF;
END;
$postflight$;

COMMIT;
