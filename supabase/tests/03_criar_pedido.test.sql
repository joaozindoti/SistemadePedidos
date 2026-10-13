-- RPC criar_pedido: grava pedido, itens e sabores juntos, soma o total,
-- guarda o nome digitado em orders.customer_name sem sobrescrever
-- customers.name, devolve o mesmo pedido no retry (idempotency_key) e
-- numera por dia sem repetir.
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into public.menu_items (id, name, category, base_price, max_flavors) values
  ('12000000-0000-4000-8000-000000000001', 'Pizza Teste RPC', 'pizza', 45, 2),
  ('12000000-0000-4000-8000-000000000002', 'Bebida Teste RPC', 'bebida', 5, null);

insert into public.flavors (id, name, extra_price) values
  ('22000000-0000-4000-8000-000000000001', 'Sabor A Teste RPC', 0),
  ('22000000-0000-4000-8000-000000000002', 'Sabor B Teste RPC', 0);

-- Monta o payload no formato que o create-order manda.
create temp table pedido_base as select jsonb_build_object(
  'idempotency_key', '62000000-0000-4000-8000-000000000001',
  'phone', '5599933330001',
  'name', '  Maria Teste  ',
  'order_type', 'entrega',
  'payment_method', 'dinheiro',
  'change_for', 200,
  'notes', '',
  'address_street', 'Rua A', 'address_number', '10', 'address_complement', null,
  'address_neighborhood', 'Centro', 'address_city', 'Pedreiras',
  'items', jsonb_build_array(
    jsonb_build_object('menu_item_id', '12000000-0000-4000-8000-000000000001', 'crust_id', null,
                       'quantity', 2, 'unit_price', 45.555, 'item_notes', 'sem cebola',
                       'flavor_ids', jsonb_build_array('22000000-0000-4000-8000-000000000001',
                                                       '22000000-0000-4000-8000-000000000002',
                                                       '22000000-0000-4000-8000-000000000001')),
    jsonb_build_object('menu_item_id', '12000000-0000-4000-8000-000000000002',
                       'quantity', 1, 'unit_price', 5)
  )
) as p;

create temp table r1 as select public.criar_pedido((select p from pedido_base)) as r;

select is((select (r ->> 'reused')::boolean from r1), false, 'pedido novo: reused = false');
select is((select (r ->> 'total')::numeric from r1), 96.12, 'total = soma de round(unit_price, 2) * quantity');
select is((select total from public.orders where id = (select (r ->> 'order_id')::uuid from r1)),
          96.12::numeric(10,2), 'orders.total igual ao total devolvido');
select is((select count(*)::int from public.order_items where order_id = (select (r ->> 'order_id')::uuid from r1)),
          2, 'dois itens gravados');
select is((select count(*)::int from public.order_item_flavors f
             join public.order_items i on i.id = f.order_item_id
            where i.order_id = (select (r ->> 'order_id')::uuid from r1)),
          2, 'sabor repetido no mesmo item vira um só');
select is((select customer_name from public.orders where id = (select (r ->> 'order_id')::uuid from r1)),
          'Maria Teste', 'orders.customer_name = nome digitado (sem espaços nas pontas)');
select is((select name from public.customers where phone = '5599933330001'),
          'Maria Teste', 'cliente novo nasce com o nome digitado');
select is((select notes from public.orders where id = (select (r ->> 'order_id')::uuid from r1)),
          null, 'notes vazio vira null');

-- Retry do mesmo checkout: mesmo pedido, nada novo gravado.
create temp table r2 as select public.criar_pedido((select p from pedido_base)) as r;
select is((select (r ->> 'reused')::boolean from r2), true, 'retry com a mesma chave: reused = true');
select is((select r ->> 'order_id' from r2), (select r ->> 'order_id' from r1), 'retry devolve o mesmo pedido');
select is((select count(*)::int from public.orders o join public.customers c on c.id = o.customer_id
            where c.phone = '5599933330001'),
          1, 'retry não duplica pedido');

select throws_ok(
  $$select public.criar_pedido((select p || '{"phone":"5599933330002"}' from pedido_base))$$,
  '23505', null, 'mesma chave com outro telefone é recusada');

-- Segundo pedido do mesmo telefone com outro nome.
create temp table r3 as select public.criar_pedido(
  (select (p - 'idempotency_key') || '{"name":"Outro Nome"}' from pedido_base)) as r;
select is((select name from public.customers where phone = '5599933330001'),
          'Maria Teste', 'customers.name não é sobrescrito por pedido novo');
select is((select customer_name from public.orders where id = (select (r ->> 'order_id')::uuid from r3)),
          'Outro Nome', 'o pedido novo guarda o nome digitado nele');
select is((select (r ->> 'order_number')::int from r3), (select (r ->> 'order_number')::int from r1) + 1,
          'número do pedido segue em sequência no dia');

-- Nome gigante é cortado em 80.
create temp table r4 as select public.criar_pedido(
  (select (p - 'idempotency_key') || jsonb_build_object('phone', '5599933330003', 'name', repeat('a', 200))
     from pedido_base)) as r;
select is((select char_length(customer_name) from public.orders where id = (select (r ->> 'order_id')::uuid from r4)),
          80, 'customer_name cortado em 80 caracteres');

select throws_ok(
  $$update public.orders set order_number = (select (r ->> 'order_number')::int from r1)
     where id = (select (r ->> 'order_id')::uuid from r3)$$,
  '23505', null, 'número do pedido não repete no mesmo dia (orders_dia_order_number_uq)');

select throws_ok(
  $$select public.criar_pedido((select jsonb_set(p, '{items}', '[]') from pedido_base))$$,
  '22023', null, 'lista de itens vazia é recusada');
select throws_ok(
  $$select public.criar_pedido((select p - 'phone' from pedido_base))$$,
  '22023', null, 'sem telefone é recusado');
select throws_ok(
  $$select public.criar_pedido((select (p - 'idempotency_key') || '{"payment_method":"pix"}' from pedido_base))$$,
  '23514', null, 'troco com pix é recusado (orders_change_for_so_dinheiro)');

-- Quem chama em produção é a edge function, com a service role.
grant select on pedido_base to service_role;
set local role service_role;
select lives_ok(
  $$select public.criar_pedido((select (p - 'idempotency_key') || '{"phone":"5599933330004"}' from pedido_base))$$,
  'service_role executa criar_pedido');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';
select throws_ok($$select public.criar_pedido('{}'::jsonb)$$, '42501', null,
  'nem admin executa criar_pedido direto (só service role)');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
