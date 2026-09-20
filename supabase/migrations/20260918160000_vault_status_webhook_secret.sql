-- Generates the shared secret server-side (never appears in source control)
-- and stores it in Supabase Vault, which does not require superuser access.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'status_webhook_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'status_webhook_secret',
      'Shared secret sent by notify_order_status_change() to send-status-notification'
    );
  end if;
end $$;

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  webhook_secret text;
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'status_webhook_secret';

    perform net.http_post(
      url := 'https://idypukzfbozcpcdwewxj.supabase.co/functions/v1/send-status-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object(
        'order_id', new.id,
        'status', new.status,
        'order_type', new.order_type,
        'estimated_minutes', new.estimated_minutes,
        'customer_id', new.customer_id
      )
    );
  end if;
  return new;
end;
$$;
