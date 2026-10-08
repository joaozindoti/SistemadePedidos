-- Até aqui, "logado e não é cozinha" = acesso completo de admin. Como a
-- chave anon é pública (vai no site) e o cadastro por e-mail do Supabase
-- vem ligado por padrão, qualquer pessoa conseguia criar uma conta pela API
-- e ler todos os pedidos e telefones de clientes, mexer no cardápio e no
-- WhatsApp.
--
-- Agora o acesso é por cargo explícito em app_metadata.role (que só o
-- service role altera):
--   'admin'   → painel completo
--   'cozinha' → só a tela da cozinha (ver 20260929120000_cargo_cozinha.sql)
--   nada      → nenhum acesso, mesmo logado
--
-- ANTES de aplicar, dê o cargo de admin pra conta do dono, senão o painel
-- fica sem acesso:
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--    where email = 'EMAIL_DO_ADMIN';
-- (e saia/entre de novo no painel pra o token novo valer)

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ───────────── cardápio ─────────────
drop policy "admin atualiza cardapio" on public.menu_items;
drop policy "admin atualiza sabores" on public.flavors;
drop policy "admin atualiza bordas" on public.crusts;
create policy "admin atualiza cardapio" on public.menu_items for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin atualiza sabores" on public.flavors for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin atualiza bordas" on public.crusts for update
  using (public.is_admin()) with check (public.is_admin());

drop policy "admin cria item cardapio" on public.menu_items;
drop policy "admin cria sabor" on public.flavors;
drop policy "admin cria borda" on public.crusts;
create policy "admin cria item cardapio" on public.menu_items for insert
  with check (public.is_admin());
create policy "admin cria sabor" on public.flavors for insert
  with check (public.is_admin());
create policy "admin cria borda" on public.crusts for insert
  with check (public.is_admin());

-- Leitura do cardápio inteiro (inclusive inativos): admin pra editar,
-- cozinha pra o nome de um sabor desativado no meio do expediente ainda
-- aparecer na comanda.
drop policy "admin ve tudo do cardapio" on public.menu_items;
drop policy "admin ve todos sabores" on public.flavors;
drop policy "admin ve todas bordas" on public.crusts;
create policy "equipe ve tudo do cardapio" on public.menu_items for select
  using (public.is_admin() or public.is_cozinha());
create policy "equipe ve todos sabores" on public.flavors for select
  using (public.is_admin() or public.is_cozinha());
create policy "equipe ve todas bordas" on public.crusts for select
  using (public.is_admin() or public.is_cozinha());

-- ───────────── whatsapp ─────────────
drop policy "admin gerencia whatsapp" on public.whatsapp_instances;
create policy "admin gerencia whatsapp" on public.whatsapp_instances for all
  using (public.is_admin()) with check (public.is_admin());

-- ───────────── pedidos ─────────────
drop policy "admin le tudo" on public.orders;
create policy "admin le tudo" on public.orders for select
  using (public.is_admin());

drop policy "admin atualiza status" on public.orders;
create policy "admin atualiza status" on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

-- Itens e sabores: antes qualquer logado lia o histórico inteiro. A
-- cozinha agora só vê os itens dos pedidos em preparo (a subconsulta em
-- orders já passa pela RLS dela).
drop policy "admin le itens" on public.order_items;
create policy "admin le itens" on public.order_items for select
  using (public.is_admin());
create policy "cozinha le itens em preparo" on public.order_items for select
  using (
    public.is_cozinha()
    and exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.status = 'preparo'
    )
  );

drop policy "admin le sabores do pedido" on public.order_item_flavors;
create policy "admin le sabores do pedido" on public.order_item_flavors for select
  using (public.is_admin());
create policy "cozinha le sabores em preparo" on public.order_item_flavors for select
  using (
    public.is_cozinha()
    and exists (
      select 1
        from public.order_items i
        join public.orders o on o.id = i.order_id
       where i.id = order_item_flavors.order_item_id
         and o.status = 'preparo'
    )
  );

-- ───────────── clientes ─────────────
drop policy "admin le clientes" on public.customers;
create policy "admin le clientes" on public.customers for select
  using (public.is_admin());
