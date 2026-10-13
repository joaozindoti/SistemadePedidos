-- Caixa: gastos com material e fechamento do dia (2026-10-13).
-- O relatório (dia/semana/mês) é somado no painel a partir de orders + gastos;
-- aqui só ficam as duas tabelas novas, visíveis e editáveis só pelo admin.

-- ───────────── 1. gastos ─────────────
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  dia date not null default ((now() at time zone 'America/Fortaleza')::date),
  descricao text not null check (length(trim(descricao)) between 1 and 80),
  valor numeric(10,2) not null check (valor > 0 and valor < 100000),
  created_at timestamptz not null default now()
);
create index if not exists idx_gastos_dia on public.gastos (dia);

alter table public.gastos enable row level security;
drop policy if exists "admin gastos" on public.gastos;
create policy "admin gastos" on public.gastos for all
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.gastos to authenticated;

-- ───────────── 2. fechamento do caixa ─────────────
-- Um por dia. resumo guarda a foto dos números na hora de fechar; fechar de
-- novo no mesmo dia atualiza.
create table if not exists public.fechamentos_caixa (
  dia date primary key,
  fechado_em timestamptz not null default now(),
  resumo jsonb not null,
  observacao text check (observacao is null or length(observacao) <= 300)
);

alter table public.fechamentos_caixa enable row level security;
drop policy if exists "admin fechamentos" on public.fechamentos_caixa;
create policy "admin fechamentos" on public.fechamentos_caixa for all
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.fechamentos_caixa to authenticated;
