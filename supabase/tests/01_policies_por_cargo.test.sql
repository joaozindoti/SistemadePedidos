-- RLS por cargo: anon (cardápio público), logado sem cargo (nada), cozinha
-- (só o que está em preparo) e admin (tudo). As contagens filtram pelos ids
-- criados aqui, pra não depender do que já existe no banco.
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(52);

-- ───────────── fixtures (como postgres, sem RLS) ─────────────
insert into public.menu_items (id, name, category, base_price, max_flavors, active) values
  ('10000000-0000-4000-8000-000000000001', 'Pizza Teste RLS', 'pizza', 40, 2, true),
  ('10000000-0000-4000-8000-000000000002', 'Item Inativo Teste RLS', 'bebida', 5, null, false);

insert into public.flavors (id, name, extra_price) values
  ('20000000-0000-4000-8000-000000000001', 'Sabor Teste RLS', 0);

insert into public.customers (id, phone, name) values
  ('30000000-0000-4000-8000-000000000001', '5599911110001', 'Cliente Pendente'),
  ('30000000-0000-4000-8000-000000000002', '5599911110002', 'Cliente Preparo');

insert into public.orders (id, customer_id, customer_name, order_type, payment_method, status, total) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Cliente Pendente', 'retirada', 'pix', 'pendente', 40),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Cliente Preparo', 'entrega', 'pix', 'preparo', 40);

insert into public.order_items (id, order_id, menu_item_id, quantity, unit_price) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 40),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 1, 40);

insert into public.order_item_flavors (order_item_id, flavor_id) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');

-- ───────────── estrutura das policies ─────────────
select policies_are('public', 'orders',
  array['admin le tudo', 'admin atualiza status', 'cozinha le pedidos em preparo', 'cozinha marca pronto'],
  'orders: só as 4 policies conhecidas');
select policies_are('public', 'customers',
  array['admin le clientes', 'cozinha le cliente do pedido em preparo'],
  'customers: só leitura de admin e cozinha');
select policies_are('public', 'order_items',
  array['admin le itens', 'cozinha le itens em preparo'],
  'order_items: só leitura de admin e cozinha');
select policies_are('public', 'order_item_flavors',
  array['admin le sabores do pedido', 'cozinha le sabores em preparo'],
  'order_item_flavors: só leitura de admin e cozinha');
select policies_are('public', 'menu_items',
  array['cardapio publico', 'equipe ve tudo do cardapio', 'admin atualiza cardapio', 'admin cria item cardapio'],
  'menu_items: público lê ativos, equipe lê tudo, admin escreve');
select policies_are('public', 'loja_config',
  array['horario publico', 'admin altera horario'],
  'loja_config: leitura pública, só admin altera');
select policies_are('public', 'pedido_tentativas', array[]::name[],
  'pedido_tentativas: nenhuma policy (só service role)');
select policies_are('public', 'whatsapp_envios_link', array[]::name[],
  'whatsapp_envios_link: nenhuma policy (só service role)');

select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                          'SELECT is_(admin|cozinha)\(\)', '', 'g') ~ 'is_(admin|cozinha)\(\)'
  ),
  'toda policy chama is_admin()/is_cozinha() dentro de (select ...)'
);

-- ───────────── anon ─────────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*)::int from public.orders
            where id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')),
          0, 'anon: não lê pedidos');
select is((select count(*)::int from public.customers
            where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')),
          0, 'anon: não lê clientes');
select is((select count(*)::int from public.order_items
            where id in ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')),
          0, 'anon: não lê itens de pedido');
select is((select count(*)::int from public.menu_items where id = '10000000-0000-4000-8000-000000000001'),
          1, 'anon: lê item ativo do cardápio');
select is((select count(*)::int from public.menu_items where id = '10000000-0000-4000-8000-000000000002'),
          0, 'anon: não lê item inativo');
select is((select count(*)::int from public.loja_config where id = 1), 1, 'anon: lê o horário');
select throws_ok(
  $$insert into public.orders (customer_id, order_type, payment_method)
    values ('30000000-0000-4000-8000-000000000001', 'retirada', 'pix')$$,
  '42501', null, 'anon: não cria pedido direto na tabela');
select throws_ok($$select public.criar_pedido('{}'::jsonb)$$, '42501', null,
  'anon: não executa criar_pedido');
select throws_ok($$select public.resumo_do_dia()$$, '42501', null,
  'anon: não executa resumo_do_dia');
select throws_ok($$select public.registrar_envio_link('5599911110001')$$, '42501', null,
  'anon: não executa registrar_envio_link');
select throws_ok($$select count(*) from public.whatsapp_envios_link$$, '42501', null,
  'anon: não lê whatsapp_envios_link');

-- UPDATE sem policy não dá erro: só não acha linha (conferido abaixo).
update public.loja_config set modo = 'fechada' where id = 1;

reset role;
reset request.jwt.claims;

select is((select modo from public.loja_config where id = 1) is distinct from 'fechada',
          true, 'anon: update no horário não teve efeito');

-- ───────────── logado sem cargo ─────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';

select is((select count(*)::int from public.orders
            where id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')),
          0, 'sem cargo: não lê pedidos');
select is((select count(*)::int from public.customers
            where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')),
          0, 'sem cargo: não lê clientes');
select is((select count(*)::int from public.menu_items where id = '10000000-0000-4000-8000-000000000002'),
          0, 'sem cargo: não lê item inativo');
select throws_ok(
  $$insert into public.menu_items (name, category, base_price) values ('X', 'bebida', 1)$$,
  '42501', null, 'sem cargo: não cria item no cardápio');
select throws_ok($$select public.resumo_do_dia()$$, '42501', null,
  'sem cargo: resumo_do_dia recusa');
select is(public.pedidos_aguardando_aceite(), 0, 'sem cargo: pedidos_aguardando_aceite devolve 0');

reset role;
reset request.jwt.claims;

-- ───────────── cozinha ─────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"cozinha"}}';

select is((select count(*)::int from public.orders where id = '40000000-0000-4000-8000-000000000002'),
          1, 'cozinha: lê pedido em preparo');
select is((select count(*)::int from public.orders where id = '40000000-0000-4000-8000-000000000001'),
          0, 'cozinha: não lê pedido pendente');
select is((select count(*)::int from public.customers where id = '30000000-0000-4000-8000-000000000002'),
          1, 'cozinha: lê cliente do pedido em preparo');
select is((select count(*)::int from public.customers where id = '30000000-0000-4000-8000-000000000001'),
          0, 'cozinha: não lê cliente de pedido pendente');
select is((select count(*)::int from public.order_items where id = '50000000-0000-4000-8000-000000000002'),
          1, 'cozinha: lê itens do pedido em preparo');
select is((select count(*)::int from public.order_items where id = '50000000-0000-4000-8000-000000000001'),
          0, 'cozinha: não lê itens de pedido pendente');
select is((select count(*)::int from public.order_item_flavors
            where order_item_id = '50000000-0000-4000-8000-000000000002'),
          1, 'cozinha: lê sabores do pedido em preparo');
select is((select count(*)::int from public.order_item_flavors
            where order_item_id = '50000000-0000-4000-8000-000000000001'),
          0, 'cozinha: não lê sabores de pedido pendente');
select is((select count(*)::int from public.menu_items where id = '10000000-0000-4000-8000-000000000002'),
          1, 'cozinha: lê item inativo (nome na comanda)');
select throws_ok(
  $$insert into public.menu_items (name, category, base_price) values ('X', 'bebida', 1)$$,
  '42501', null, 'cozinha: não cria item no cardápio');
select is((select count(*)::int from public.whatsapp_instances), 0, 'cozinha: não lê whatsapp_instances');
select throws_ok($$select public.resumo_do_dia()$$, '42501', null,
  'cozinha: resumo_do_dia recusa');
select ok(public.pedidos_aguardando_aceite() >= 1, 'cozinha: vê quantos pedidos aguardam aceite');

-- UPDATE sem policy não dá erro: só não acha linha.
update public.menu_items set base_price = 1 where id = '10000000-0000-4000-8000-000000000001';
update public.loja_config set modo = 'fechada' where id = 1;

reset role;
reset request.jwt.claims;

select is((select base_price from public.menu_items where id = '10000000-0000-4000-8000-000000000001'),
          40.00::numeric(10,2), 'cozinha: update no cardápio não teve efeito');
select is((select modo from public.loja_config where id = 1) is distinct from 'fechada',
          true, 'cozinha: update no horário não teve efeito');

-- ───────────── admin ─────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';

select is((select count(*)::int from public.orders
            where id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002')),
          2, 'admin: lê todos os pedidos');
select is((select count(*)::int from public.customers
            where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')),
          2, 'admin: lê todos os clientes');
select is((select count(*)::int from public.order_items
            where id in ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')),
          2, 'admin: lê todos os itens');
select is((select count(*)::int from public.menu_items where id = '10000000-0000-4000-8000-000000000002'),
          1, 'admin: lê item inativo');
select lives_ok(
  $$insert into public.menu_items (name, category, base_price) values ('Bebida Teste Admin', 'bebida', 6)$$,
  'admin: cria bebida');
select throws_ok(
  $$insert into public.menu_items (name, category, base_price) values ('Pizza Sem Limite', 'pizza', 50)$$,
  '23514', null, 'admin: pizza sem max_flavors é recusada');
select lives_ok($$update public.loja_config set modo = 'fechada' where id = 1$$,
  'admin: altera o horário');
select ok(public.resumo_do_dia() ? 'por_status', 'admin: resumo_do_dia responde');
select throws_ok($$select count(*) from public.whatsapp_envios_link$$, '42501', null,
  'admin: whatsapp_envios_link continua só da service role');

reset role;
reset request.jwt.claims;

select is((select modo from public.loja_config where id = 1), 'fechada', 'admin: update no horário gravou');

select * from finish();
rollback;
