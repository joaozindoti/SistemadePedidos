-- Comer no local (2026-10-28): além de entrega e retirada, o cliente pode
-- pedir pra comer na pizzaria — de casa, antes de chegar, ou já sentado à
-- mesa pelo QR Code (/pedido?mesa=5).

-- ───────────── tipo do pedido ─────────────
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders
  add constraint orders_order_type_check check (order_type in ('entrega', 'retirada', 'local'));

-- Mesa (texto curto: "5", "Varanda 2"). Vazio em pedido "local" = cliente
-- ainda a caminho; nas outras modalidades fica sempre nulo.
alter table public.orders
  add column if not exists table_number text
  check (table_number is null or (order_type = 'local' and length(table_number) between 1 and 20));

-- ───────────── criar_pedido grava a mesa ─────────────
-- Mesma função de 20261013120000_especiais_frete_folga.sql, só acrescentando
-- table_number. Frete continua só pra entrega.
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
  v_name text := left(nullif(trim(p ->> 'name'), ''), 80);
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number integer;
  v_total numeric(10,2);
  v_fee numeric(10,2) := 0;
  -- Mesa só faz sentido em pedido pra comer no local.
  v_table text := case
    when p ->> 'order_type' = 'local' then left(nullif(trim(p ->> 'table_number'), ''), 20)
  end;
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

  -- Nunca sobrescreve o nome de um cliente que já existe; só preenche se
  -- estava vazio. O nome deste pedido vai em orders.customer_name.
  insert into public.customers as c (phone, name)
  values (v_phone, v_name)
  on conflict (phone) do update
    set name = coalesce(c.name, excluded.name)
  returning c.id into v_customer_id;

  select coalesce(sum(round((i ->> 'unit_price')::numeric, 2) * (i ->> 'quantity')::integer), 0)
    into v_total
    from jsonb_array_elements(p -> 'items') as x(i);

  -- Frete pela tabela taxas_entrega (fonte da verdade; o front só mostra).
  if p ->> 'order_type' = 'entrega' then
    select t.valor into v_fee
      from public.taxas_entrega t
     where t.ativo and lower(t.cidade) = lower(trim(p ->> 'address_city'));
    if v_fee is null then
      raise exception 'cidade_sem_entrega: não entregamos em %', p ->> 'address_city'
        using errcode = '22023';
    end if;
  end if;
  v_total := v_total + v_fee;

  insert into public.orders (
    customer_id, customer_name, order_type, payment_method, change_for, notes, total, delivery_fee,
    address_street, address_number, address_complement,
    address_neighborhood, address_city, idempotency_key, table_number
  )
  values (
    v_customer_id,
    v_name,
    p ->> 'order_type',
    p ->> 'payment_method',
    (p ->> 'change_for')::numeric,
    nullif(p ->> 'notes', ''),
    v_total,
    v_fee,
    nullif(p ->> 'address_street', ''),
    nullif(p ->> 'address_number', ''),
    nullif(p ->> 'address_complement', ''),
    nullif(p ->> 'address_neighborhood', ''),
    nullif(p ->> 'address_city', ''),
    v_key,
    v_table
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
