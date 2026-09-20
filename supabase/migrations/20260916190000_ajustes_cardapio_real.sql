-- permitir a categoria "esfirra" em menu_items
alter table public.menu_items drop constraint menu_items_category_check;
alter table public.menu_items add constraint menu_items_category_check check (category in ('pizza', 'bebida', 'esfirra'));

-- separar sabor salgado de doce
alter table public.flavors add column flavor_type text not null default 'salgada' check (flavor_type in ('salgada', 'doce'));
