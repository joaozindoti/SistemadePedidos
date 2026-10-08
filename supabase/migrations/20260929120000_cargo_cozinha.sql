-- Dois tipos de acesso ao painel: 'cozinha' e acesso completo (dono/atendente,
-- na prática a mesma pessoa). O cargo fica em auth.users.raw_app_meta_data,
-- que só o service role altera — o usuário logado não consegue se autopromover.
-- Único valor especial é role = 'cozinha'; ausência do campo (ou qualquer
-- outro valor) = acesso completo.

create or replace function public.is_cozinha()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'cozinha';
$$;

-- ───────────── cardápio ─────────────
-- SELECT continua liberado pra cozinha de propósito: o card do pedido faz join
-- em menu_items/flavors/crusts pra mostrar tamanho, sabor e borda. Se um sabor
-- for desativado no meio do expediente (acabou o ingrediente), a policy
-- pública (active = true) não cobre mais ele e o card ficaria sem o nome.
-- Leitura não dá poder nenhum de edição; insert/update ficam bloqueados.

drop policy "admin atualiza cardapio" on public.menu_items;
drop policy "admin atualiza sabores" on public.flavors;
drop policy "admin atualiza bordas" on public.crusts;
create policy "admin atualiza cardapio" on public.menu_items for update
  using (auth.role() = 'authenticated' and not public.is_cozinha())
  with check (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "admin atualiza sabores" on public.flavors for update
  using (auth.role() = 'authenticated' and not public.is_cozinha())
  with check (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "admin atualiza bordas" on public.crusts for update
  using (auth.role() = 'authenticated' and not public.is_cozinha())
  with check (auth.role() = 'authenticated' and not public.is_cozinha());

drop policy "admin cria item cardapio" on public.menu_items;
drop policy "admin cria sabor" on public.flavors;
drop policy "admin cria borda" on public.crusts;
create policy "admin cria item cardapio" on public.menu_items for insert
  with check (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "admin cria sabor" on public.flavors for insert
  with check (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "admin cria borda" on public.crusts for insert
  with check (auth.role() = 'authenticated' and not public.is_cozinha());

-- ───────────── whatsapp_instances ─────────────
drop policy "admin gerencia whatsapp" on public.whatsapp_instances;
create policy "admin gerencia whatsapp" on public.whatsapp_instances for all
  using (auth.role() = 'authenticated' and not public.is_cozinha())
  with check (auth.role() = 'authenticated' and not public.is_cozinha());

-- ───────────── orders ─────────────
-- Horário em que o pedido foi aceito (entrou em 'preparo'). updated_at não
-- serve: muda em qualquer update.
alter table public.orders add column accepted_at timestamptz;
update public.orders set accepted_at = updated_at
  where status in ('preparo', 'pronto', 'saiu_entrega', 'finalizado');

create or replace function public.set_order_accepted_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'preparo' and old.status is distinct from 'preparo' then
    new.accepted_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_orders_accepted_at
before update on public.orders
for each row execute function public.set_order_accepted_at();

drop policy "admin le tudo" on public.orders;
create policy "admin le tudo" on public.orders for select
  using (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "cozinha le pedidos em preparo" on public.orders for select
  using (public.is_cozinha() and status = 'preparo');

drop policy "admin atualiza status" on public.orders;
create policy "admin atualiza status" on public.orders for update
  using (auth.role() = 'authenticated' and not public.is_cozinha())
  with check (auth.role() = 'authenticated' and not public.is_cozinha());
create policy "cozinha marca pronto" on public.orders for update
  using (public.is_cozinha() and status = 'preparo')
  with check (public.is_cozinha() and status = 'pronto');

-- A policy garante preparo→pronto, mas não impede a cozinha de mudar outras
-- colunas (total, estimated_minutes...) na mesma chamada. Esse trigger só
-- deixa passar status e delivery_estimated_minutes (este só em entrega).
create or replace function public.guard_cozinha_order_update()
returns trigger
language plpgsql
as $$
begin
  if not public.is_cozinha() then
    return new;
  end if;

  if old.status <> 'preparo' or new.status <> 'pronto' then
    raise exception 'cozinha só pode mudar pedido de preparo para pronto';
  end if;

  if new.order_type <> 'entrega'
     and new.delivery_estimated_minutes is distinct from old.delivery_estimated_minutes then
    raise exception 'tempo de entrega só vale pra pedido de entrega';
  end if;

  if (to_jsonb(new) - 'status' - 'delivery_estimated_minutes' - 'updated_at' - 'accepted_at')
     <> (to_jsonb(old) - 'status' - 'delivery_estimated_minutes' - 'updated_at' - 'accepted_at') then
    raise exception 'cozinha só pode alterar status e tempo de entrega';
  end if;

  return new;
end;
$$;

create trigger trg_orders_guard_cozinha
before update on public.orders
for each row execute function public.guard_cozinha_order_update();
