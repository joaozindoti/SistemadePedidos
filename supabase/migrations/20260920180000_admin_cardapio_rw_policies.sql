-- Faltavam SELECT (pra ver item inativo, não só os públicos) e INSERT
-- (pra criar item novo) no cardápio pro admin autenticado; só existia UPDATE.

create policy "admin ve tudo do cardapio" on public.menu_items for select using (auth.role() = 'authenticated');
create policy "admin ve todos sabores" on public.flavors for select using (auth.role() = 'authenticated');
create policy "admin ve todas bordas" on public.crusts for select using (auth.role() = 'authenticated');

create policy "admin cria item cardapio" on public.menu_items for insert with check (auth.role() = 'authenticated');
create policy "admin cria sabor" on public.flavors for insert with check (auth.role() = 'authenticated');
create policy "admin cria borda" on public.crusts for insert with check (auth.role() = 'authenticated');
