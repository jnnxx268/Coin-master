-- Support databases that already applied the accounting RPC migration before
-- the admin-send action was added.
BEGIN;

DO $admin_send_compatibility$
BEGIN
  IF to_regprocedure(
       'coinmaster_private.transfer_demo_asset_internal(text,text,numeric,uuid,boolean)'
     ) IS NULL THEN
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.admin_send_demo_asset(
        p_recipient_email text,
        p_asset text,
        p_amount numeric,
        p_request_id uuid
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO ''
      AS $function$
      DECLARE
        v_actor uuid := auth.uid();
        v_recipient uuid;
      BEGIN
        IF v_actor IS NULL
           OR COALESCE(
             (auth.jwt() -> 'app_metadata' ->> 'admin') = 'true',
             false
           ) = false THEN
          RAISE EXCEPTION 'Admin access required.';
        END IF;

        IF p_recipient_email IS NULL OR btrim(p_recipient_email) = '' THEN
          RAISE EXCEPTION 'A recipient account is required.';
        END IF;

        SELECT u.id
          INTO v_recipient
        FROM auth.users AS u
        WHERE lower(u.email) = lower(btrim(p_recipient_email))
        LIMIT 1;

        IF v_recipient IS NULL THEN
          RAISE EXCEPTION 'Recipient account not found.';
        END IF;

        IF v_recipient = v_actor THEN
          RAISE EXCEPTION 'You cannot transfer to yourself.';
        END IF;

        RETURN public.admin_credit_demo_asset(
          v_recipient,
          p_asset,
          p_amount,
          p_request_id
        );
      END;
      $function$
    $ddl$;
  END IF;
END;
$admin_send_compatibility$;

ALTER FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  OWNER TO postgres;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION public.admin_send_demo_asset(text, text, numeric, uuid)
  TO authenticated;

DO $admin_send_privileges$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.admin_send_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.admin_send_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.admin_send_demo_asset(text, text, numeric, uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'Unexpected effective execution privileges on admin send RPC';
  END IF;
END;
$admin_send_privileges$;

COMMIT;
