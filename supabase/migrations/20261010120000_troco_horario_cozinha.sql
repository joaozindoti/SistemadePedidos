-- Três ajustes de operação:
--   1. cozinha conseguir marcar "pronto" (bug de RLS)
--   2. troco pra pagamento em dinheiro
--   3. horário de funcionamento: cardápio, create-order e WhatsApp param de
--      aceitar pedido fora do horário

-- ───────────── 1. cozinha marca pronto ─────────────
-- O PostgREST faz UPDATE ... RETURNING. Com RLS, a linha devolvida precisa
-- passar numa policy de SELECT — e a cozinha só via 'preparo'. Resultado:
-- "new row violates row-level security policy" e o botão Pronto não fazia
-- nada. A cozinha agora também enxerga o que ficou pronto nas últimas 12h
-- (a tela continua filtrando só 'preparo').
drop policy "cozinha le pedidos em preparo" on public.orders;
create policy "cozinha le pedidos em preparo" on public.orders for select
  using (
    public.is_cozinha()
    and (
      status = 'preparo'
      or (status = 'pronto' and updated_at > now() - interval '12 hours')
    )
  );

-- A cozinha não lê pedidos pendentes (não tem nada pra fazer com eles), mas
-- mostrar quantos estão esperando o balcão aceitar evita o "cadê o pedido?".
create or replace function public.pedidos_aguardando_aceite()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_cozinha() or public.is_admin()
      then (select count(*)::integer from public.orders where status = 'pendente')
    else 0
  end;
$$;

revoke all on function public.pedidos_aguardando_aceite() from public, anon;
grant execute on function public.pedidos_aguardando_aceite() to authenticated;

-- ───────────── 2. troco ─────────────
-- Valor que o cliente vai entregar ("troco para R$ 100"). Nulo = não precisa
-- de troco ou não é dinheiro. A validação (>= total) fica no create-order.
alter table public.orders
  add column change_for numeric(10,2)
  check (change_for is null or change_for > 0);

-- ───────────── 3. horário de funcionamento ─────────────
-- Uma linha só (id = 1). Horários no fuso de Pedreiras/MA. modo:
--   'auto'    → segue abre_as/fecha_as
--   'aberta'  → aberta agora, ignorando o horário (noite movimentada)
--   'fechada' → fechada agora, ignorando o horário (imprevisto, folga)
create table public.loja_config (
  id smallint primary key default 1 check (id = 1),
  abre_as time not null default '18:00',
  fecha_as time not null default '23:00',
  modo text not null default 'auto' check (modo in ('auto', 'aberta', 'fechada')),
  updated_at timestamptz not null default now()
);

insert into public.loja_config (id) values (1);

create trigger trg_loja_config_updated_at
before update on public.loja_config
for each row execute function public.set_updated_at();

alter table public.loja_config enable row level security;

-- O cardápio (anônimo) precisa ler pra mostrar "abrimos às 18h".
create policy "horario publico" on public.loja_config for select using (true);
create policy "admin altera horario" on public.loja_config for update
  using (public.is_admin()) with check (public.is_admin());

-- Aceita janela que vira a meia-noite (ex.: 18:00 → 02:00).
create or replace function public.loja_aberta()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case c.modo
      when 'aberta' then true
      when 'fechada' then false
      else case
        when c.abre_as < c.fecha_as then t.agora >= c.abre_as and t.agora < c.fecha_as
        else t.agora >= c.abre_as or t.agora < c.fecha_as
      end
    end
    from public.loja_config c,
         lateral (select (now() at time zone 'America/Fortaleza')::time as agora) t
    where c.id = 1
  ), true);
$$;

grant execute on function public.loja_aberta() to anon, authenticated, service_role;

-- Quem já recebeu o aviso de "estamos fechados" no WhatsApp. O webhook
-- avisa uma vez por noite e depois fica quieto, em vez de responder cada
-- mensagem. Só a service role (edge function) mexe aqui.
create table public.whatsapp_avisos_fechado (
  phone text primary key,
  avisado_em timestamptz not null default now()
);

alter table public.whatsapp_avisos_fechado enable row level security;

-- true = pode mandar o aviso agora (primeira mensagem da noite). Atômico:
-- duas mensagens chegando juntas não geram dois avisos.
create or replace function public.registrar_aviso_fechado(p_phone text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with upsert as (
    insert into public.whatsapp_avisos_fechado as a (phone, avisado_em)
    values (p_phone, now())
    on conflict (phone) do update
      set avisado_em = now()
      where a.avisado_em < now() - interval '12 hours'
    returning 1
  )
  select exists (select 1 from upsert);
$$;

revoke all on function public.registrar_aviso_fechado(text) from public, anon, authenticated;
grant execute on function public.registrar_aviso_fechado(text) to service_role;
