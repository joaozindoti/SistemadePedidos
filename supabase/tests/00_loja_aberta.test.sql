-- loja_aberta(): modo manual, janela de horário (inclusive virando a
-- meia-noite), "fail open" sem configuração e o CHECK abre_as <> fecha_as.
-- Os horários são montados em volta da hora atual de America/Fortaleza
-- (now() é fixo dentro da transação), então o teste não depende de quando
-- roda. Rodar com: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- hora local "congelada" desta transação
create temp table agora_local as
  select (now() at time zone 'America/Fortaleza')::time as t;

update public.loja_config set modo = 'aberta' where id = 1;
select is(public.loja_aberta(), true, 'modo aberta ignora o horário');

update public.loja_config set modo = 'fechada' where id = 1;
select is(public.loja_aberta(), false, 'modo fechada ignora o horário');

update public.loja_config
   set modo = 'auto',
       abre_as = (select t - interval '1 hour' from agora_local),
       fecha_as = (select t + interval '1 hour' from agora_local)
 where id = 1;
select is(public.loja_aberta(), true, 'auto: dentro da janela [t-1h, t+1h)');

update public.loja_config
   set abre_as = (select t + interval '1 hour' from agora_local),
       fecha_as = (select t + interval '2 hours' from agora_local)
 where id = 1;
select is(public.loja_aberta(), false, 'auto: fora da janela [t+1h, t+2h)');

-- abre depois de fechar = janela que atravessa a meia-noite; aberta em
-- tudo menos [t+1h, t+2h).
update public.loja_config
   set abre_as = (select t + interval '2 hours' from agora_local),
       fecha_as = (select t + interval '1 hour' from agora_local)
 where id = 1;
select is(public.loja_aberta(), true, 'auto: janela que vira a meia-noite inclui a hora atual');

-- Horário fixo que vira a meia-noite: abre_as > fecha_as.
update public.loja_config set abre_as = '18:00', fecha_as = '02:00' where id = 1;
select is(
  public.loja_aberta(),
  (select t >= '18:00' or t < '02:00' from agora_local),
  'auto: 18:00 → 02:00 segue a regra de virar a meia-noite'
);

select throws_ok(
  $$update public.loja_config set abre_as = '20:00', fecha_as = '20:00' where id = 1$$,
  '23514', null,
  'abre_as = fecha_as é recusado (antes deixava a loja aberta 24h)'
);

-- Sem linha de configuração a loja fica aberta (decisão D2: fail open).
delete from public.loja_config where id = 1;
select is(public.loja_aberta(), true, 'sem configuração: aberta (fail open)');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select lives_ok($$select public.loja_aberta()$$, 'anon consegue chamar loja_aberta()');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
