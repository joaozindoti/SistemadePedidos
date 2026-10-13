-- Fases 2 e 3 das correções da vistoria de 2026-10-12 (itens do relatório
-- vistoria/2026-10-12.md):
--   1. tamanho de pizza sem max_flavors (item 8)
--   2. nome digitado no checkout gravado no pedido (orders.customer_name)
--   3. resultado da notificação de status gravado no pedido (item 18)
--   4. notify_order_status_change com search_path, URL no Vault e número
--      do pedido no payload (item 29)
--   5. horário com abre_as = fecha_as (item 34)
--   6. integridade e desempenho: unique do número do pedido por dia,
--      índices de FK, índice redundante e policies com (select ...) (item 36)
--   7. RPC resumo_do_dia() pro painel (item 26)
--   8. link do cardápio no WhatsApp no máximo 1 vez a cada 3h (item 16)
--
-- Escrita pra poder rodar de novo sem quebrar (if exists / if not exists).

-- ───────────── 1. max_flavors obrigatório em pizza ─────────────
-- Tamanho criado pelo painel ficava com max_flavors nulo: o cliente lia
-- "1 de null" e o create-order não limitava sabores. Nulo existente vira 1
-- (o mais conservador; o dono ajusta no painel).
update public.menu_items
   set max_flavors = 1
 where category = 'pizza'
   and (max_flavors is null or max_flavors < 1);

alter table public.menu_items drop constraint if exists menu_items_pizza_max_flavors;
-- coalesce: CHECK com resultado nulo passa, então "max_flavors >= 1" sozinho
-- deixaria entrar justamente o nulo.
alter table public.menu_items add constraint menu_items_pizza_max_flavors
  check (category <> 'pizza' or coalesce(max_flavors, 0) >= 1);

-- ───────────── 2. nome digitado no pedido ─────────────
-- criar_pedido nunca sobrescreve customers.name (qualquer um trocaria o nome
-- de outro sabendo o telefone), então o nome que o cliente digitou neste
-- pedido se perdia. Ele fica no próprio pedido; customers.name segue sendo o
-- do primeiro pedido.
alter table public.orders add column if not exists customer_name text;

-- Pedidos antigos: o nome que o painel já mostrava pra eles.
update public.orders o
   set customer_name = left(c.name, 80)
  from public.customers c
 where c.id = o.customer_id
   and o.customer_name is null
   and c.name is not null;

alter table public.orders drop constraint if exists orders_customer_name_tamanho;
alter table public.orders add constraint orders_customer_name_tamanho
  check (char_length(customer_name) <= 80);

-- Mesmo contrato da Fase 1 (entrada e saída); só passa a gravar
-- orders.customer_name com o `name` do payload.
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

  insert into public.orders (
    customer_id, customer_name, order_type, payment_method, change_for, notes, total,
    address_street, address_number, address_complement,
    address_neighborhood, address_city, idempotency_key
  )
  values (
    v_customer_id,
    v_name,
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

-- ───────────── 2b. telefone canônico em customers ─────────────
-- O create-order passou a gravar celular sempre com o 9 (55 + DDD + 9 + 8
-- dígitos, mesma regra de supabase/functions/_shared/phone.ts). Cliente
-- antigo gravado sem o 9 ganharia um segundo cadastro no próximo pedido.
-- Aqui só ganha o 9 o número de 12 dígitos, com DDI 55, DDD válido e
-- assinante começando em 6–9 (celular sem o 9; 2–5 é fixo e fica igual).
-- Se a forma com 9 já existe (o cliente já pediu depois da mudança), os
-- dois cadastros NÃO são juntados aqui: só conta e avisa, pra decidir à mão.
do $$
declare
  v_normalizados integer;
  v_colisoes integer;
begin
  select count(*) into v_colisoes
    from public.customers c
   where c.phone ~ '^55[1-9][1-9][6-9][0-9]{7}$'
     and exists (
       select 1 from public.customers n
        where n.phone = substr(c.phone, 1, 4) || '9' || substr(c.phone, 5)
     );

  update public.customers c
     set phone = substr(c.phone, 1, 4) || '9' || substr(c.phone, 5)
   where c.phone ~ '^55[1-9][1-9][6-9][0-9]{7}$'
     and not exists (
       select 1 from public.customers n
        where n.phone = substr(c.phone, 1, 4) || '9' || substr(c.phone, 5)
     );
  get diagnostics v_normalizados = row_count;

  raise notice 'customers.phone: % celular(es) ganharam o 9.', v_normalizados;
  if v_colisoes > 0 then
    raise notice 'customers.phone: % cliente(s) têm cadastro com e sem o 9; não foram juntados (o webhook acha as duas formas).', v_colisoes;
  end if;
end;
$$;

-- ───────────── 3. resultado da notificação ─────────────
-- A send-status-notification respondia 200 mesmo quando o WhatsApp falhava,
-- e ninguém ficava sabendo. Agora ela grava (service role) o resultado da
-- última notificação do pedido, e o painel alerta quando falhou.
--   'enviada'  → mensagem aceita pela API do WhatsApp
--   'falhou'   → erro ou timeout (motivo em notificacao_erro)
--   'ignorada' → status sem mensagem pro cliente, ou cliente sem telefone
alter table public.orders
  add column if not exists notificacao_status text,
  add column if not exists notificacao_erro text,
  add column if not exists notificacao_em timestamptz;

alter table public.orders drop constraint if exists orders_notificacao_status_check;
alter table public.orders add constraint orders_notificacao_status_check
  check (notificacao_status in ('enviada', 'falhou', 'ignorada'));

alter table public.orders drop constraint if exists orders_notificacao_erro_tamanho;
alter table public.orders add constraint orders_notificacao_erro_tamanho
  check (char_length(notificacao_erro) <= 500);

-- ───────────── 4. notify_order_status_change ─────────────
-- Era SECURITY DEFINER sem search_path e com a URL de produção fixa. A URL
-- agora vem do Vault (secret 'status_webhook_url'), com a de produção de
-- fallback enquanto o secret não for criado. Pra criar/trocar:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-status-notification',
--                              'status_webhook_url', 'URL chamada por notify_order_status_change()');
-- O payload ganha order_number e customer_name (a function não precisa mais
-- buscar o pedido pra montar a mensagem; customer_name pode vir nulo em
-- pedido antigo).
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
  webhook_url text;
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    select decrypted_secret into webhook_secret
      from vault.decrypted_secrets
     where name = 'status_webhook_secret';

    select decrypted_secret into webhook_url
      from vault.decrypted_secrets
     where name = 'status_webhook_url';

    perform net.http_post(
      url := coalesce(
        nullif(trim(webhook_url), ''),
        'https://idypukzfbozcpcdwewxj.supabase.co/functions/v1/send-status-notification'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'status', new.status,
        'order_type', new.order_type,
        'estimated_minutes', new.estimated_minutes,
        'delivery_estimated_minutes', new.delivery_estimated_minutes,
        'customer_id', new.customer_id,
        'customer_name', new.customer_name
      )
    );
  end if;
  return new;
end;
$$;

-- Função de trigger; ninguém precisa chamar direto.
revoke all on function public.notify_order_status_change() from public, anon, authenticated;

-- As outras funções de trigger também ficavam sem search_path (o linter do
-- Supabase aponta). Todas já qualificam o que usam com public.; o corpo não
-- muda.
alter function public.set_updated_at() set search_path = '';
alter function public.set_order_accepted_at() set search_path = '';
alter function public.guard_cozinha_order_update() set search_path = '';

-- ───────────── 5. abre_as = fecha_as ─────────────
-- Com os dois iguais a loja_aberta() cai no ramo "vira a meia-noite" e fica
-- aberta 24h. Pra ficar aberta direto existe o modo 'aberta'.
alter table public.loja_config drop constraint if exists loja_config_horario_distinto;
alter table public.loja_config add constraint loja_config_horario_distinto
  check (abre_as <> fecha_as) not valid;

do $$
begin
  alter table public.loja_config validate constraint loja_config_horario_distinto;
exception when check_violation then
  raise warning 'public.loja_config: abre_as = fecha_as hoje; loja_config_horario_distinto ficou NOT VALID. Ajuste o horário no painel e rode VALIDATE CONSTRAINT.';
end;
$$;

-- ───────────── 6. integridade e desempenho ─────────────
-- 6a. Número do pedido único por dia (America/Fortaleza). O trigger passa a
-- tirar o dia de new.created_at (que por padrão é now(), então nada muda no
-- uso normal) pra numeração e unique usarem exatamente o mesmo "dia", mesmo
-- se alguém inserir com created_at explícito.
create or replace function public.set_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inicio_do_dia timestamptz :=
    date_trunc('day', coalesce(new.created_at, now()) at time zone 'America/Fortaleza')
      at time zone 'America/Fortaleza';
begin
  -- Serializa só a numeração: dois pedidos chegando no mesmo instante não
  -- podem ler o mesmo max() e sair com número repetido.
  perform pg_advisory_xact_lock(hashtext('orders.order_number'));

  select coalesce(max(order_number), 0) + 1
    into new.order_number
    from public.orders
   where created_at >= inicio_do_dia
     and created_at < inicio_do_dia + interval '1 day';

  return new;
end;
$$;

-- Se já houver número repetido no mesmo dia (não deveria), o índice não
-- entra e a migration segue com aviso, em vez de travar o deploy.
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'orders_dia_order_number_uq'
  ) then
    if exists (
      select 1 from public.orders
       group by (created_at at time zone 'America/Fortaleza')::date, order_number
      having count(*) > 1
    ) then
      raise warning 'public.orders tem order_number repetido no mesmo dia; orders_dia_order_number_uq não foi criado.';
    else
      create unique index orders_dia_order_number_uq
        on public.orders (((created_at at time zone 'America/Fortaleza')::date), order_number);
    end if;
  end if;
end;
$$;

-- 6b. Índices nas FKs (joins do painel e delete/update no cardápio sem seq scan).
create index if not exists idx_orders_customer_id on public.orders (customer_id);
create index if not exists idx_order_items_menu_item_id on public.order_items (menu_item_id);
create index if not exists idx_order_items_crust_id on public.order_items (crust_id);
create index if not exists idx_order_item_flavors_flavor_id on public.order_item_flavors (flavor_id);

-- 6c. customers.phone já tem o índice do unique (customers_phone_key).
drop index if exists public.idx_customers_phone;

-- 6d. Policies: is_admin()/is_cozinha() dentro de (select ...) viram um
-- InitPlan avaliado uma vez por consulta, em vez de uma vez por linha.
-- Mesma regra de antes, policy por policy. As públicas (active = true,
-- horario publico) não chamam função e ficam como estão.

-- cardápio
drop policy if exists "admin atualiza cardapio" on public.menu_items;
create policy "admin atualiza cardapio" on public.menu_items for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin cria item cardapio" on public.menu_items;
create policy "admin cria item cardapio" on public.menu_items for insert
  with check ((select public.is_admin()));
drop policy if exists "equipe ve tudo do cardapio" on public.menu_items;
create policy "equipe ve tudo do cardapio" on public.menu_items for select
  using ((select public.is_admin()) or (select public.is_cozinha()));

drop policy if exists "admin atualiza sabores" on public.flavors;
create policy "admin atualiza sabores" on public.flavors for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin cria sabor" on public.flavors;
create policy "admin cria sabor" on public.flavors for insert
  with check ((select public.is_admin()));
drop policy if exists "equipe ve todos sabores" on public.flavors;
create policy "equipe ve todos sabores" on public.flavors for select
  using ((select public.is_admin()) or (select public.is_cozinha()));

drop policy if exists "admin atualiza bordas" on public.crusts;
create policy "admin atualiza bordas" on public.crusts for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin cria borda" on public.crusts;
create policy "admin cria borda" on public.crusts for insert
  with check ((select public.is_admin()));
drop policy if exists "equipe ve todas bordas" on public.crusts;
create policy "equipe ve todas bordas" on public.crusts for select
  using ((select public.is_admin()) or (select public.is_cozinha()));

-- whatsapp e horário
drop policy if exists "admin gerencia whatsapp" on public.whatsapp_instances;
create policy "admin gerencia whatsapp" on public.whatsapp_instances for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin altera horario" on public.loja_config;
create policy "admin altera horario" on public.loja_config for update
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- pedidos
drop policy if exists "admin le tudo" on public.orders;
create policy "admin le tudo" on public.orders for select
  using ((select public.is_admin()));

drop policy if exists "admin atualiza status" on public.orders;
create policy "admin atualiza status" on public.orders for update
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "cozinha le pedidos em preparo" on public.orders;
create policy "cozinha le pedidos em preparo" on public.orders for select
  using (
    (select public.is_cozinha())
    and (
      status = 'preparo'
      or (status = 'pronto' and updated_at > now() - interval '12 hours')
      or (status = 'cancelado' and accepted_at is not null
          and cancelled_at > now() - interval '12 hours')
    )
  );

drop policy if exists "cozinha marca pronto" on public.orders;
create policy "cozinha marca pronto" on public.orders for update
  using ((select public.is_cozinha()) and status = 'preparo')
  with check ((select public.is_cozinha()) and status = 'pronto');

-- itens e sabores do pedido
drop policy if exists "admin le itens" on public.order_items;
create policy "admin le itens" on public.order_items for select
  using ((select public.is_admin()));

drop policy if exists "cozinha le itens em preparo" on public.order_items;
create policy "cozinha le itens em preparo" on public.order_items for select
  using (
    (select public.is_cozinha())
    and exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.status = 'preparo'
    )
  );

drop policy if exists "admin le sabores do pedido" on public.order_item_flavors;
create policy "admin le sabores do pedido" on public.order_item_flavors for select
  using ((select public.is_admin()));

drop policy if exists "cozinha le sabores em preparo" on public.order_item_flavors;
create policy "cozinha le sabores em preparo" on public.order_item_flavors for select
  using (
    (select public.is_cozinha())
    and exists (
      select 1
        from public.order_items i
        join public.orders o on o.id = i.order_id
       where i.id = order_item_flavors.order_item_id
         and o.status = 'preparo'
    )
  );

-- clientes
drop policy if exists "admin le clientes" on public.customers;
create policy "admin le clientes" on public.customers for select
  using ((select public.is_admin()));

drop policy if exists "cozinha le cliente do pedido em preparo" on public.customers;
create policy "cozinha le cliente do pedido em preparo" on public.customers for select
  using (
    (select public.is_cozinha())
    and exists (
      select 1 from public.orders o
       where o.customer_id = customers.id
         and o.status = 'preparo'
    )
  );

-- ───────────── 7. resumo_do_dia ─────────────
-- O StatsPanel cortava o dia no fuso do aparelho e somava no navegador.
-- Agora o banco agrega, com "hoje" = dia de America/Fortaleza.
--   pedidos     → pedidos do dia, menos os cancelados
--   faturamento → soma de total só dos status faturáveis (aceitos e não
--                 cancelados): preparo, pronto, saiu_entrega, finalizado
--   por_status  → sempre as 7 chaves, 0 quando não há
-- SECURITY INVOKER: lê orders pela RLS de quem chama; a checagem explícita
-- só dá um erro claro pra quem não é admin (a cozinha veria um resumo
-- parcial, só do que a RLS dela mostra).
create or replace function public.resumo_do_dia()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_dia date := (now() at time zone 'America/Fortaleza')::date;
  v_inicio timestamptz := v_dia::timestamp at time zone 'America/Fortaleza';
  v_resultado jsonb;
begin
  if not public.is_admin() then
    raise exception 'resumo_do_dia é só para admin' using errcode = '42501';
  end if;

  with do_dia as (
    select o.status, o.total
      from public.orders o
     where o.created_at >= v_inicio
       and o.created_at < v_inicio + interval '1 day'
  )
  select jsonb_build_object(
           'dia', to_char(v_dia, 'YYYY-MM-DD'),
           'pedidos', (select count(*) from do_dia where status <> 'cancelado'),
           'faturamento', (
             select coalesce(sum(total), 0)::numeric(12,2) from do_dia
              where status in ('preparo', 'pronto', 'saiu_entrega', 'finalizado')
           ),
           'por_status', jsonb_object_agg(
             s.status, (select count(*) from do_dia d where d.status = s.status)
           )
         )
    into v_resultado
    from unnest(array['pendente', 'confirmado', 'preparo', 'pronto',
                      'saiu_entrega', 'finalizado', 'cancelado']) as s(status);

  return v_resultado;
end;
$$;

revoke all on function public.resumo_do_dia() from public, anon;
grant execute on function public.resumo_do_dia() to authenticated;

-- ───────────── 8. link do cardápio no WhatsApp ─────────────
-- O webhook respondia o link a cada mensagem do cliente. Mesmo padrão do
-- aviso de loja fechada: guarda o último envio por telefone e só deixa
-- mandar de novo depois de 3h. Só a service role (edge function) mexe.
create table if not exists public.whatsapp_envios_link (
  phone text primary key,
  enviado_em timestamptz not null default now()
);

alter table public.whatsapp_envios_link enable row level security;
revoke all on table public.whatsapp_envios_link from anon, authenticated;

-- true = pode mandar o link agora (e o envio fica registrado); false = já
-- mandou nas últimas 3h. Atômico: duas mensagens juntas não geram dois links.
create or replace function public.registrar_envio_link(p_phone text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with upsert as (
    insert into public.whatsapp_envios_link as e (phone, enviado_em)
    values (p_phone, now())
    on conflict (phone) do update
      set enviado_em = now()
      where e.enviado_em < now() - interval '3 hours'
    returning 1
  )
  select exists (select 1 from upsert);
$$;

revoke all on function public.registrar_envio_link(text) from public, anon, authenticated;
grant execute on function public.registrar_envio_link(text) to service_role;
