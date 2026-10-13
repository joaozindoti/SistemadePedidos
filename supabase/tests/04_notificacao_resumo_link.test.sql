-- notify_order_status_change (URL do Vault com fallback e payload com
-- order_number/customer_name), colunas de resultado da notificação,
-- resumo_do_dia() no fuso America/Fortaleza, registrar_envio_link() e o
-- CHECK de max_flavors em pizza.
-- O teste do trigger lê a fila do pg_net (net.http_request_queue): dentro da
-- transação o pedido HTTP fica só enfileirado e some no rollback.
-- Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into public.customers (id, phone, name) values
  ('34000000-0000-4000-8000-000000000001', '5599944440001', 'Nome Antigo');

insert into public.orders (id, customer_id, customer_name, order_type, payment_method, status, total) values
  ('44000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', 'João do Pedido',
   'entrega', 'pix', 'pendente', 30);

-- ───────────── notify_order_status_change ─────────────
delete from vault.secrets where name = 'status_webhook_url';

create temp table fila_antes as select coalesce(max(id), 0) as id from net.http_request_queue;

update public.orders set status = 'preparo', estimated_minutes = 40
 where id = '44000000-0000-4000-8000-000000000001';

create temp table req1 as
  select url, headers, convert_from(body, 'UTF8')::jsonb as body
    from net.http_request_queue
   where id > (select id from fila_antes)
   order by id desc limit 1;

select is((select count(*)::int from req1), 1, 'troca de status enfileira uma chamada');
select is((select url from req1),
          'https://idypukzfbozcpcdwewxj.supabase.co/functions/v1/send-status-notification',
          'sem secret status_webhook_url: usa a URL de fallback');
select is((select body ->> 'status' from req1), 'preparo', 'payload: status novo');
select is((select (body ->> 'order_number')::int from req1),
          (select order_number from public.orders where id = '44000000-0000-4000-8000-000000000001'),
          'payload: order_number');
select is((select body ->> 'customer_name' from req1), 'João do Pedido',
          'payload: customer_name do pedido (não o de customers)');
select is((select (body ->> 'estimated_minutes')::int from req1), 40, 'payload: estimated_minutes');
select ok((select headers ? 'x-webhook-secret' from req1), 'header x-webhook-secret presente');

do $$
begin
  perform vault.create_secret('https://exemplo.invalid/functions/v1/send-status-notification',
                              'status_webhook_url');
end;
$$;

update public.orders set status = 'pronto' where id = '44000000-0000-4000-8000-000000000001';

select is((select url from net.http_request_queue where id > (select id from fila_antes) order by id desc limit 1),
          'https://exemplo.invalid/functions/v1/send-status-notification',
          'com secret status_webhook_url: usa a URL do Vault');

create temp table fila_meio as select max(id) as id from net.http_request_queue;

-- Gravar o resultado da notificação não muda status: não pode redisparar.
update public.orders
   set notificacao_status = 'falhou', notificacao_erro = 'timeout', notificacao_em = now()
 where id = '44000000-0000-4000-8000-000000000001';

select is((select count(*)::int from net.http_request_queue where id > (select id from fila_meio)),
          0, 'update sem troca de status não chama a notificação (sem loop)');

-- ───────────── colunas de notificação ─────────────
select is((select notificacao_status from public.orders where id = '44000000-0000-4000-8000-000000000001'),
          'falhou', 'notificacao_status gravado');
select throws_ok(
  $$update public.orders set notificacao_status = 'perdida'
     where id = '44000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'notificacao_status fora da lista é recusado');
select throws_ok(
  $$update public.orders set notificacao_erro = repeat('x', 501)
     where id = '44000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'notificacao_erro acima de 500 caracteres é recusado');
select throws_ok(
  $$update public.orders set customer_name = repeat('x', 81)
     where id = '44000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'customer_name acima de 80 caracteres é recusado');

-- ───────────── resumo_do_dia ─────────────
-- Com as claims de admin, mas como postgres: o "antes" e o "depois" contam
-- o mesmo universo, então a diferença é só o que este teste inseriu.
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';
create temp table resumo_antes as select public.resumo_do_dia() as r;

create temp table inicio as
  select (date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza') as t;

insert into public.orders (customer_id, order_type, payment_method, status, total, created_at, cancelled_at)
select '34000000-0000-4000-8000-000000000001', 'retirada', 'pix', v.status, v.total, v.criado,
       case when v.status = 'cancelado' then now() end
  from (values
    ('pendente',     10.00, now()),
    ('preparo',      20.00, now()),
    ('finalizado',   30.00, now()),
    ('cancelado',    40.00, now()),
    ('saiu_entrega',  5.00, now()),
    ('finalizado',    7.00, (select t from inicio)),                       -- meia-noite em ponto: conta
    ('finalizado',  100.00, (select t - interval '1 second' from inicio))  -- 23:59:59 de ontem: não conta
  ) as v(status, total, criado);

create temp table resumo_depois as select public.resumo_do_dia() as r;
reset request.jwt.claims;

select is((select r ->> 'dia' from resumo_depois),
          to_char(now() at time zone 'America/Fortaleza', 'YYYY-MM-DD'), 'dia no fuso America/Fortaleza');
select is((select (d.r ->> 'pedidos')::int - (a.r ->> 'pedidos')::int from resumo_antes a, resumo_depois d),
          5, 'pedidos do dia não contam cancelado nem ontem');
select is((select (d.r ->> 'faturamento')::numeric - (a.r ->> 'faturamento')::numeric from resumo_antes a, resumo_depois d),
          62.00, 'faturamento só de preparo/pronto/saiu_entrega/finalizado do dia');
select is((select (d.r -> 'por_status' ->> 'cancelado')::int - (a.r -> 'por_status' ->> 'cancelado')::int
             from resumo_antes a, resumo_depois d),
          1, 'por_status conta o cancelado');
select is((select (d.r -> 'por_status' ->> 'finalizado')::int - (a.r -> 'por_status' ->> 'finalizado')::int
             from resumo_antes a, resumo_depois d),
          2, 'por_status: finalizado de ontem fica de fora');
select is((select array_agg(k order by k) from resumo_depois, jsonb_object_keys(r -> 'por_status') k),
          array['cancelado', 'confirmado', 'finalizado', 'pendente', 'preparo', 'pronto', 'saiu_entrega'],
          'por_status sempre traz os 7 status');

-- Pelo caminho real (role authenticated + RLS de admin) o número bate.
grant select on resumo_depois to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.resumo_do_dia() ->> 'pedidos', (select r ->> 'pedidos' from resumo_depois),
          'admin pela RLS vê o mesmo resumo');
reset role;
reset request.jwt.claims;

-- ───────────── registrar_envio_link ─────────────
select is(public.registrar_envio_link('5599944449999'), true, 'link: primeira mensagem manda');
select is(public.registrar_envio_link('5599944449999'), false, 'link: segunda mensagem em seguida não manda');
select is(public.registrar_envio_link('5599944448888'), true, 'link: outro telefone manda');
update public.whatsapp_envios_link set enviado_em = now() - interval '3 hours 1 minute'
 where phone = '5599944449999';
select is(public.registrar_envio_link('5599944449999'), true, 'link: depois de 3h manda de novo');

-- ───────────── max_flavors ─────────────
select throws_ok(
  $$insert into public.menu_items (name, category, base_price, max_flavors) values ('Pizza Zero', 'pizza', 10, 0)$$,
  '23514', null, 'pizza com max_flavors 0 é recusada');
select lives_ok(
  $$insert into public.menu_items (name, category, base_price) values ('Esfirra Teste', 'esfirra', 5)$$,
  'esfirra sem max_flavors continua valendo');

select * from finish();
rollback;
