-- Fotos enviadas pelo painel e Brotinho sem preço especial (2026-10-18).

-- ───────────── 1. tamanho que não cobra sabor especial ─────────────
-- Com false, qualquer sabor sai no preço base do tamanho (o Brotinho).
alter table public.menu_items
  add column if not exists cobra_especial boolean not null default true;

update public.menu_items
   set cobra_especial = false
 where category = 'pizza'
   and name ilike 'brotinho%';

-- ───────────── 2. foto por item e por sabor ─────────────
-- URL pública do arquivo no bucket "cardapio". Nulo = foto padrão do site.
alter table public.menu_items add column if not exists image_url text;
alter table public.flavors add column if not exists image_url text;

-- ───────────── 3. bucket das fotos ─────────────
-- Público pra leitura (o cardápio é público); só admin envia ou apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cardapio', 'cardapio', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cardapio fotos leitura" on storage.objects;
create policy "cardapio fotos leitura" on storage.objects for select
  using (bucket_id = 'cardapio');

drop policy if exists "cardapio fotos admin envia" on storage.objects;
create policy "cardapio fotos admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'cardapio' and (select public.is_admin()));

drop policy if exists "cardapio fotos admin altera" on storage.objects;
create policy "cardapio fotos admin altera" on storage.objects for update to authenticated
  using (bucket_id = 'cardapio' and (select public.is_admin()))
  with check (bucket_id = 'cardapio' and (select public.is_admin()));

drop policy if exists "cardapio fotos admin apaga" on storage.objects;
create policy "cardapio fotos admin apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'cardapio' and (select public.is_admin()));
