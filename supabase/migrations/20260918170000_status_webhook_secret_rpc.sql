-- Lets the send-status-notification Edge Function (using the service role)
-- read the Vault secret directly instead of relying on a copy kept in sync
-- as a separate Edge Function secret.
create or replace function public.get_status_webhook_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'status_webhook_secret';
$$;

revoke all on function public.get_status_webhook_secret() from public, anon, authenticated;
grant execute on function public.get_status_webhook_secret() to service_role;
