-- habilita Realtime (postgres_changes) na tabela orders, usado pela fila do painel admin
alter publication supabase_realtime add table public.orders;
