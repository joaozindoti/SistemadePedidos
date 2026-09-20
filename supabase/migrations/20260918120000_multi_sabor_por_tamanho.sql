-- cada tamanho de pizza define quantos sabores no máximo pode ter
alter table public.menu_items add column max_flavors integer;

update public.menu_items set max_flavors = 1 where name = 'Brotinho';
update public.menu_items set max_flavors = 1 where name = 'Pizza P (4 fatias)';
update public.menu_items set max_flavors = 2 where name = 'Pizza M (6 fatias)';
update public.menu_items set max_flavors = 3 where name = 'Pizza G (8 fatias)';
update public.menu_items set max_flavors = 3 where name = 'Pizza Família (12 fatias)';

-- sabor deixa de ser uma coluna única em order_items e vira relação N:N
alter table public.order_items drop column flavor_id;

create table public.order_item_flavors (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id)
);

create index idx_order_item_flavors_order_item_id on public.order_item_flavors(order_item_id);

alter table public.order_item_flavors enable row level security;
create policy "admin le sabores do pedido" on public.order_item_flavors for select using (auth.role() = 'authenticated');
-- sem policy de insert pro client anônimo, escrita só pela Edge Function via service role

-- libera o admin autenticado pra ativar/desativar item do cardápio (a coluna active já existia, faltava a permissão de update)
create policy "admin atualiza cardapio" on public.menu_items for update using (auth.role() = 'authenticated');
create policy "admin atualiza sabores" on public.flavors for update using (auth.role() = 'authenticated');
create policy "admin atualiza bordas" on public.crusts for update using (auth.role() = 'authenticated');
