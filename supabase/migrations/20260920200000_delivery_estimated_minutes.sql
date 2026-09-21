-- estimated_minutes é o tempo de PREPARO (preenchido ao aceitar o pedido).
-- Reaproveitar esse mesmo número na mensagem de "pronto" pra entrega tava
-- errado: "chega em X min" precisa de um tempo de ENTREGA, perguntado só
-- quando o pedido em preparo é marcado como pronto (e só pra order_type
-- 'entrega' — retirada não tem isso).

alter table public.orders add column delivery_estimated_minutes integer;

-- Reaplica notify_order_status_change (definição atual em
-- 20260918160000_vault_status_webhook_secret.sql) só acrescentando
-- delivery_estimated_minutes ao payload — resto idêntico.
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
        'delivery_estimated_minutes', new.delivery_estimated_minutes,
        'customer_id', new.customer_id
      )
    );
  end if;
  return new;
end;
$$;
