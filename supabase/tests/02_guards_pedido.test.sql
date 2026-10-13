-- Triggers de guarda em orders: guard_cozinha_order_update (cozinha só faz
-- preparo → pronto e só mexe no tempo de entrega) e guard_order_cancelamento
-- (de onde pode cancelar, cancelado é terminal, cancelled_at é do banco).
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into public.customers (id, phone, name) values
  ('31000000-0000-4000-8000-000000000001', '5599922220001', 'Cliente Guard');

insert into public.orders (id, customer_id, order_type, payment_method, status, total) values
  ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'entrega',  'pix', 'preparo',    50),
  ('41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', 'retirada', 'pix', 'preparo',    50),
  ('41000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'retirada', 'pix', 'pendente',   50),
  ('41000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000001', 'retirada', 'pix', 'finalizado', 50),
  ('41000000-0000-4000-8000-000000000005', '31000000-0000-4000-8000-000000000001', 'retirada', 'pix', 'pendente',   50);

-- ───────────── cozinha ─────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"cozinha"}}';

select lives_ok(
  $$update public.orders set status = 'pronto', delivery_estimated_minutes = 30
     where id = '41000000-0000-4000-8000-000000000001'$$,
  'cozinha: preparo → pronto com tempo de entrega (entrega)');

select throws_ok(
  $$update public.orders set status = 'pronto', total = 0
     where id = '41000000-0000-4000-8000-000000000002'$$,
  'P0001', 'cozinha só pode alterar status e tempo de entrega',
  'cozinha: não muda o total junto com o status');

select throws_ok(
  $$update public.orders set status = 'pronto', delivery_estimated_minutes = 10
     where id = '41000000-0000-4000-8000-000000000002'$$,
  'P0001', 'tempo de entrega só vale pra pedido de entrega',
  'cozinha: não põe tempo de entrega em retirada');

select throws_ok(
  $$update public.orders set status = 'cancelado'
     where id = '41000000-0000-4000-8000-000000000002'$$,
  'P0001', 'cozinha só pode mudar pedido de preparo para pronto',
  'cozinha: não cancela pedido');

-- Pedido pendente nem aparece pra cozinha: o update não acha a linha.
update public.orders set status = 'preparo' where id = '41000000-0000-4000-8000-000000000003';

reset role;
reset request.jwt.claims;

select is((select status from public.orders where id = '41000000-0000-4000-8000-000000000001'),
          'pronto', 'cozinha: o pronto gravou');
select is((select delivery_estimated_minutes from public.orders where id = '41000000-0000-4000-8000-000000000001'),
          30, 'cozinha: o tempo de entrega gravou');
select is((select status from public.orders where id = '41000000-0000-4000-8000-000000000003'),
          'pendente', 'cozinha: não aceita pedido pendente');

-- ───────────── admin: aceite e cancelamento ─────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';

update public.orders set status = 'preparo' where id = '41000000-0000-4000-8000-000000000005';

select lives_ok(
  $$update public.orders set status = 'cancelado', cancel_reason = 'trote'
     where id = '41000000-0000-4000-8000-000000000003'$$,
  'admin: cancela pedido pendente');

select throws_ok(
  $$update public.orders set status = 'pendente'
     where id = '41000000-0000-4000-8000-000000000003'$$,
  'P0001', 'pedido cancelado não pode mudar de status',
  'admin: cancelado é terminal');

select throws_ok(
  $$update public.orders set status = 'cancelado'
     where id = '41000000-0000-4000-8000-000000000004'$$,
  'P0001', 'pedido só pode ser cancelado a partir de pendente, preparo ou pronto',
  'admin: não cancela pedido finalizado');

select throws_ok(
  $$update public.orders set cancel_reason = 'x'
     where id = '41000000-0000-4000-8000-000000000004'$$,
  '23514', null,
  'admin: motivo de cancelamento só em pedido cancelado');

-- Tentar reescrever cancelled_at não tem efeito (o trigger mantém o antigo).
update public.orders set cancelled_at = '2000-01-01'
 where id = '41000000-0000-4000-8000-000000000003';

-- Cancela um pedido que a cozinha já aceitou.
update public.orders set status = 'cancelado'
 where id = '41000000-0000-4000-8000-000000000002';

reset role;
reset request.jwt.claims;

select ok((select accepted_at is not null from public.orders where id = '41000000-0000-4000-8000-000000000005'),
          'admin: aceitar (→ preparo) preenche accepted_at');
select ok((select cancelled_at = now() from public.orders where id = '41000000-0000-4000-8000-000000000003'),
          'cancelled_at vem do banco e não muda depois');
select is((select cancel_reason from public.orders where id = '41000000-0000-4000-8000-000000000003'),
          'trote', 'motivo do cancelamento gravado');

-- A cozinha continua vendo o pedido que aceitou e foi cancelado (o card
-- sai da tela pelo Realtime), mas não o cancelado que nunca aceitou.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"cozinha"}}';

select is((select count(*)::int from public.orders where id = '41000000-0000-4000-8000-000000000002'),
          0, 'cozinha: pedido inserido já em preparo (sem accepted_at) e cancelado não aparece');

reset role;
reset request.jwt.claims;
update public.orders set accepted_at = now() - interval '1 hour'
 where id = '41000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"cozinha"}}';

select is((select count(*)::int from public.orders where id = '41000000-0000-4000-8000-000000000002'),
          1, 'cozinha: vê o cancelado que tinha aceitado');
select is((select count(*)::int from public.orders where id = '41000000-0000-4000-8000-000000000003'),
          0, 'cozinha: não vê o cancelado que nunca aceitou');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
