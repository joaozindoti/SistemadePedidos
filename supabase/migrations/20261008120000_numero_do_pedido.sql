-- Número curto do pedido pra comanda e pro cliente ("Pedido 07"), zerando
-- todo dia. O id (uuid) continua sendo a chave; o número é só pra gente ler,
-- falar no balcão e conferir com o cliente pelo WhatsApp.
--
-- "Dia" é o dia de Pedreiras/MA (America/Fortaleza, UTC-3 sem horário de
-- verão), não o dia UTC — senão a numeração viraria às 21h.

alter table public.orders add column order_number integer;

create index if not exists idx_orders_created_at on public.orders(created_at);

create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
declare
  inicio_do_dia timestamptz :=
    date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
begin
  -- Serializa só a numeração: dois pedidos chegando no mesmo instante não
  -- podem ler o mesmo max() e sair com número repetido.
  perform pg_advisory_xact_lock(hashtext('orders.order_number'));

  select coalesce(max(order_number), 0) + 1
    into new.order_number
    from public.orders
   where created_at >= inicio_do_dia;

  return new;
end;
$$;

create trigger trg_orders_order_number
before insert on public.orders
for each row execute function public.set_order_number();

-- Numera os pedidos que já existem, por dia, na ordem em que chegaram.
with numerados as (
  select id,
         row_number() over (
           partition by (created_at at time zone 'America/Fortaleza')::date
           order by created_at
         ) as n
    from public.orders
)
update public.orders o
   set order_number = numerados.n
  from numerados
 where numerados.id = o.id;

alter table public.orders alter column order_number set not null;

-- ───────────── customers ─────────────
-- A comanda da cozinha mostra o nome do cliente. Antes, qualquer usuário
-- logado lia a tabela inteira (telefones inclusos). Agora a cozinha só
-- enxerga o cliente de pedido que está em preparo; o admin segue lendo tudo.
drop policy "admin le clientes" on public.customers;
create policy "admin le clientes" on public.customers for select
  using (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "cozinha le cliente do pedido em preparo" on public.customers for select
  using (
    public.is_cozinha()
    and exists (
      select 1 from public.orders o
       where o.customer_id = customers.id
         and o.status = 'preparo'
    )
  );
