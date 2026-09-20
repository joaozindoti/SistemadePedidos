create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    perform net.http_post(
      url := 'https://idypukzfbozcpcdwewxj.supabase.co/functions/v1/send-status-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Valor original redigido antes do primeiro push (já rotacionado para o
        -- Supabase Vault pela migration 20260918160000_vault_status_webhook_secret.sql).
        'x-webhook-secret', 'REDACTED_ROTATED_TO_VAULT'
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
