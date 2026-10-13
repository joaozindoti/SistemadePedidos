-- Fase 1 das correções da vistoria de 2026-10-12 (consolidado A3, M1, M2,
-- M3, M5, M6):
--   1. status 'cancelado' (com cancelled_at/cancel_reason e regra de transição)
--   2. CHECKs de quantidade, preço e troco
--   3. sabor repetido no mesmo item não pode mais ser gravado
--   4. idempotency_key em orders (retry do checkout não duplica pedido)
--   5. rate limit do create-order (por telefone e por IP)
--   6. RPC criar_pedido: pedido, itens e sabores no mesmo commit
--
-- Escrita pra poder rodar de novo sem quebrar (if exists / if not exists).

-- ───────────── 1. cancelado ─────────────
-- Até aqui não havia como recusar um pedido: trote ou pedido duplicado ficava
-- em 'pendente' pra sempre (e travava o cliente no WhatsApp), ou tinha que ser
-- aceito e entrava no faturamento.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pendente', 'confirmado', 'preparo', 'pronto', 'saiu_entrega', 'finalizado', 'cancelado'));

alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

-- cancelled_at é preenchido pelo trigger abaixo; motivo só faz sentido em
-- pedido cancelado. Nenhuma linha existente viola (colunas acabaram de nascer).
alter table public.orders drop constraint if exists orders_cancelamento_coerente;
alter table public.orders add constraint orders_cancelamento_coerente
  check (
    (status = 'cancelado') = (cancelled_at is not null)
    and (cancel_reason is null or status = 'cancelado')
    and (cancel_reason is null or char_length(cancel_reason) <= 500)
  );

-- A policy do admin aceita qualquer UPDATE, então a regra fica aqui:
--   - só cancela a partir de pendente, preparo ou pronto;
--   - cancelado é terminal (não volta pra fila nem vira finalizado);
--   - cancelled_at é sempre do banco e não muda depois.
-- A cozinha continua sem poder cancelar: a policy "cozinha marca pronto" só
-- aceita status = 'pronto' e o guard_cozinha_order_update só deixa
-- preparo → pronto.
create or replace function public.guard_order_cancelamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelado' then
    if new.status is distinct from 'cancelado' then
      raise exception 'pedido cancelado não pode mudar de status';
    end if;
    new.cancelled_at = old.cancelled_at;
    return new;
  end if;

  if new.status = 'cancelado' then
    if old.status not in ('pendente', 'preparo', 'pronto') then
      raise exception 'pedido só pode ser cancelado a partir de pendente, preparo ou pronto';
    end if;
    new.cancelled_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_cancelamento on public.orders;
create trigger trg_orders_cancelamento
before update on public.orders
for each row execute function public.guard_order_cancelamento();

-- Se o balcão cancelar um pedido que a cozinha já está fazendo, o UPDATE do
-- Realtime só chega na cozinha se a linha nova passar na policy de SELECT
-- dela. Sem isso o card ficava na tela até o próximo refresh. A tela da
-- cozinha continua filtrando só 'preparo'; pedido cancelado ainda pendente
-- (nunca aceito) segue invisível pra ela.
drop policy if exists "cozinha le pedidos em preparo" on public.orders;
create policy "cozinha le pedidos em preparo" on public.orders for select
  using (
    public.is_cozinha()
    and (
      status = 'preparo'
      or (status = 'pronto' and updated_at > now() - interval '12 hours')
      or (status = 'cancelado' and accepted_at is not null
          and cancelled_at > now() - interval '12 hours')
    )
  );

-- Já coerentes com cancelado, sem mudança:
--   - pedidos_aguardando_aceite() conta só 'pendente';
--   - set_order_number() numera por created_at do dia, então cancelado
--     continua ocupando o número (não pode haver "Pedido 07" repetido).

-- ───────────── 2. CHECKs de quantidade, preço e troco ─────────────
-- Entram NOT VALID (não travam a migration se houver linha antiga torta) e
-- são validadas logo abaixo; a que não validar fica NOT VALID com aviso,
-- mas já vale pra toda linha nova ou alterada.
alter table public.order_items drop constraint if exists order_items_quantity_positiva;
alter table public.order_items add constraint order_items_quantity_positiva
  check (quantity > 0) not valid;

alter table public.order_items drop constraint if exists order_items_unit_price_nao_negativo;
alter table public.order_items add constraint order_items_unit_price_nao_negativo
  check (unit_price >= 0) not valid;

alter table public.orders drop constraint if exists orders_total_nao_negativo;
alter table public.orders add constraint orders_total_nao_negativo
  check (total >= 0) not valid;

-- orders_change_for_check (change_for > 0) já existe desde 20261010120000.
alter table public.orders drop constraint if exists orders_change_for_so_dinheiro;
alter table public.orders add constraint orders_change_for_so_dinheiro
  check (change_for is null or payment_method = 'dinheiro') not valid;

alter table public.menu_items drop constraint if exists menu_items_base_price_nao_negativo;
alter table public.menu_items add constraint menu_items_base_price_nao_negativo
  check (base_price >= 0) not valid;

alter table public.flavors drop constraint if exists flavors_extra_price_nao_negativo;
alter table public.flavors add constraint flavors_extra_price_nao_negativo
  check (extra_price >= 0) not valid;

alter table public.crusts drop constraint if exists crusts_extra_price_nao_negativo;
alter table public.crusts add constraint crusts_extra_price_nao_negativo
  check (extra_price >= 0) not valid;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('order_items', 'order_items_quantity_positiva'),
      ('order_items', 'order_items_unit_price_nao_negativo'),
      ('orders', 'orders_total_nao_negativo'),
      ('orders', 'orders_change_for_so_dinheiro'),
      ('menu_items', 'menu_items_base_price_nao_negativo'),
      ('flavors', 'flavors_extra_price_nao_negativo'),
      ('crusts', 'crusts_extra_price_nao_negativo')
    ) as v(tabela, restricao)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', r.tabela, r.restricao);
    exception when check_violation then
      raise warning 'public.%: % ficou NOT VALID, há linhas antigas que violam. Corrija e rode VALIDATE CONSTRAINT.',
        r.tabela, r.restricao;
    end;
  end loop;
end;
$$;

-- ───────────── 3. sabor repetido no mesmo item ─────────────
-- ["x","x"] passava e era gravado duas vezes. Repetir o sabor não muda o
-- preço (vale o extra mais caro), então apagar a cópia não perde nada.
delete from public.order_item_flavors f
 using public.order_item_flavors g
 where f.order_item_id = g.order_item_id
   and f.flavor_id = g.flavor_id
   and f.id > g.id;

alter table public.order_item_flavors drop constraint if exists order_item_flavors_item_sabor_key;
alter table public.order_item_flavors add constraint order_item_flavors_item_sabor_key
  unique (order_item_id, flavor_id);

-- O índice do unique começa por order_item_id e cobre as mesmas buscas.
drop index if exists public.idx_order_item_flavors_order_item_id;

-- ───────────── 4. idempotência do checkout ─────────────
-- O checkout gera um uuid por tentativa e reenvia o mesmo no "Tentar de
-- novo". Nulo = pedido antigo ou cliente sem a chave; unique só entre os
-- preenchidos.
alter table public.orders add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_key_uq
  on public.orders (idempotency_key)
  where idempotency_key is not null;

-- ───────────── 5. rate limit do create-order ─────────────
-- Só a service role (edge function) mexe: RLS ligada e nenhuma policy.
create table if not exists public.pedido_tentativas (
  id bigint generated always as identity primary key,
  ip text,
  phone text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_pedido_tentativas_phone on public.pedido_tentativas (phone, criado_em);
create index if not exists idx_pedido_tentativas_ip on public.pedido_tentativas (ip, criado_em);
create index if not exists idx_pedido_tentativas_criado_em on public.pedido_tentativas (criado_em);

alter table public.pedido_tentativas drop constraint if exists pedido_tentativas_tamanhos;
alter table public.pedido_tentativas add constraint pedido_tentativas_tamanhos
  check (char_length(ip) <= 45 and char_length(phone) <= 20);

alter table public.pedido_tentativas enable row level security;
revoke all on table public.pedido_tentativas from anon, authenticated;

-- true = pode seguir (e a tentativa fica registrada); false = passou do
-- limite. Máximo de 5 por telefone e 15 por IP em 10 minutos (IP mais folgado
-- porque operadora móvel põe muita gente atrás do mesmo IP). O advisory lock
-- serializa chamadas do mesmo telefone/IP, senão duas juntas leriam a mesma
-- contagem e as duas passariam. Telefone sempre antes do IP: ordem fixa, sem
-- deadlock.
create or replace function public.registrar_tentativa_pedido(p_ip text, p_phone text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- O IP vem de header e um valor de KB estouraria o índice. Acima de 45
  -- (máximo de um IPv6) não é IP de verdade: vira null e só o limite por
  -- telefone vale. Telefone normalizado tem até 13 dígitos; corta em 20.
  v_ip text := case when char_length(trim(p_ip)) between 1 and 45 then trim(p_ip) end;
  v_phone text := left(nullif(trim(p_phone), ''), 20);
begin
  if v_phone is not null then
    perform pg_advisory_xact_lock(1001, hashtext(v_phone));
  end if;
  if v_ip is not null then
    perform pg_advisory_xact_lock(1002, hashtext(v_ip));
  end if;

  delete from public.pedido_tentativas
   where criado_em < now() - interval '1 day';

  if v_phone is not null and (
    select count(*) from public.pedido_tentativas
     where phone = v_phone and criado_em > now() - interval '10 minutes'
  ) >= 5 then
    return false;
  end if;

  if v_ip is not null and (
    select count(*) from public.pedido_tentativas
     where ip = v_ip and criado_em > now() - interval '10 minutes'
  ) >= 15 then
    return false;
  end if;

  insert into public.pedido_tentativas (ip, phone) values (v_ip, v_phone);
  return true;
end;
$$;

revoke all on function public.registrar_tentativa_pedido(text, text) from public, anon, authenticated;
grant execute on function public.registrar_tentativa_pedido(text, text) to service_role;

-- ───────────── 6. RPC criar_pedido ─────────────
-- Antes o create-order gravava orders, depois cada item e cada sabor em
-- chamadas separadas. O Realtime avisava o painel no commit do pedido, que
-- podia chegar sem itens, e se um item falhasse sobrava um pedido fantasma.
-- Agora vai tudo no mesmo commit.
--
-- Preço e validação de cardápio continuam na edge function; aqui chegam os
-- valores prontos. O total é somado aqui a partir dos itens, pra orders.total
-- nunca divergir de order_items.
--
-- Entrada (p):
--   idempotency_key uuid|null, phone text (normalizado), name text,
--   order_type, payment_method, change_for numeric|null, notes text|null,
--   address_street/number/complement/neighborhood/city text|null,
--   items: [{ menu_item_id uuid, crust_id uuid|null, quantity int,
--             unit_price numeric, item_notes text|null, flavor_ids uuid[] }]
-- Saída: { order_id, order_number, total, reused }
--   reused = true quando a idempotency_key já tinha pedido: devolve esse
--   pedido e não grava nada.
create or replace function public.criar_pedido(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key uuid;
  v_phone text := nullif(trim(p ->> 'phone'), '');
  v_name text := nullif(trim(p ->> 'name'), '');
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_total numeric(10,2);
  v_existing_phone text;
  v_item jsonb;
  v_item_id uuid;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    raise exception 'payload precisa ser um objeto' using errcode = '22023';
  end if;

  if v_phone is null then
    raise exception 'phone é obrigatório' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'items precisa ser uma lista não vazia' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p -> 'items') as x(i)
     where jsonb_typeof(i) is distinct from 'object'
        or i ->> 'menu_item_id' is null
        or i ->> 'quantity' is null
        or i ->> 'unit_price' is null
        or coalesce(jsonb_typeof(i -> 'flavor_ids'), 'null') not in ('array', 'null')
  ) then
    raise exception 'item sem menu_item_id, quantity ou unit_price, ou flavor_ids não é lista'
      using errcode = '22023';
  end if;

  v_key := nullif(p ->> 'idempotency_key', '')::uuid;

  -- Retry do mesmo checkout: devolve o pedido já gravado.
  if v_key is not null then
    select o.id, o.order_number, o.total, c.phone
      into v_order_id, v_order_number, v_total, v_existing_phone
      from public.orders o
      join public.customers c on c.id = o.customer_id
     where o.idempotency_key = v_key;

    if found then
      if v_existing_phone is distinct from v_phone then
        raise exception 'idempotency_conflict: chave já usada por pedido de outro telefone' using errcode = '23505';
      end if;
      return jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'reused', true
      );
    end if;
  end if;

  -- Nunca sobrescreve o nome de um cliente que já existe (qualquer um podia
  -- trocar o nome de outro só sabendo o telefone); só preenche se estava vazio.
  insert into public.customers as c (phone, name)
  values (v_phone, v_name)
  on conflict (phone) do update
    set name = coalesce(c.name, excluded.name)
  returning c.id into v_customer_id;

  select coalesce(sum(round((i ->> 'unit_price')::numeric, 2) * (i ->> 'quantity')::integer), 0)
    into v_total
    from jsonb_array_elements(p -> 'items') as x(i);

  insert into public.orders (
    customer_id, order_type, payment_method, change_for, notes, total,
    address_street, address_number, address_complement,
    address_neighborhood, address_city, idempotency_key
  )
  values (
    v_customer_id,
    p ->> 'order_type',
    p ->> 'payment_method',
    (p ->> 'change_for')::numeric,
    nullif(p ->> 'notes', ''),
    v_total,
    nullif(p ->> 'address_street', ''),
    nullif(p ->> 'address_number', ''),
    nullif(p ->> 'address_complement', ''),
    nullif(p ->> 'address_neighborhood', ''),
    nullif(p ->> 'address_city', ''),
    v_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id, order_number into v_order_id, v_order_number;

  -- Outra chamada com a mesma chave gravou entre o select lá de cima e este
  -- insert: o insert esperou ela commitar e não gravou nada.
  if v_order_id is null then
    select o.id, o.order_number, o.total, c.phone
      into v_order_id, v_order_number, v_total, v_existing_phone
      from public.orders o
      join public.customers c on c.id = o.customer_id
     where o.idempotency_key = v_key;

    if v_existing_phone is distinct from v_phone then
      raise exception 'idempotency_conflict: chave já usada por pedido de outro telefone' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'total', v_total,
      'reused', true
    );
  end if;

  for v_item in
    select t.value
      from jsonb_array_elements(p -> 'items') with ordinality as t(value, n)
     order by t.n
  loop
    insert into public.order_items (order_id, menu_item_id, crust_id, quantity, unit_price, item_notes)
    values (
      v_order_id,
      (v_item ->> 'menu_item_id')::uuid,
      nullif(v_item ->> 'crust_id', '')::uuid,
      (v_item ->> 'quantity')::integer,
      round((v_item ->> 'unit_price')::numeric, 2),
      nullif(v_item ->> 'item_notes', '')
    )
    returning id into v_item_id;

    if jsonb_typeof(v_item -> 'flavor_ids') = 'array' then
      insert into public.order_item_flavors (order_item_id, flavor_id)
      select distinct v_item_id, f.flavor_id::uuid
        from jsonb_array_elements_text(v_item -> 'flavor_ids') as f(flavor_id);
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'reused', false
  );
end;
$$;

revoke all on function public.criar_pedido(jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb) to service_role;
