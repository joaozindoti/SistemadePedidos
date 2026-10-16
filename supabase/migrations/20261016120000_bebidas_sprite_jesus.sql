-- Sprite Zero (lata e 2 L) e Guaraná Jesus (lata, 1 L e 2 L), 2026-10-16.
-- Preço igual ao das outras bebidas do mesmo tamanho; o dono ajusta no painel.

-- O Jesus 2 L já tinha sido cadastrado pelo painel como "JESUS DE 2L":
-- só ganha o nome no padrão dos outros (e a foto, que vem pelo nome).
update public.menu_items
   set name = 'Guaraná Jesus 2 Litros'
 where category = 'bebida'
   and name ilike 'jesus%2%l%';

insert into public.menu_items (name, category, base_price, active)
select v.name, 'bebida', v.price, true
  from (values
    ('Sprite Zero 350ml', 5.00),
    ('Sprite Zero 2 Litros', 15.00),
    ('Guaraná Jesus 350ml', 5.00),
    ('Guaraná Jesus 1 Litro', 10.00),
    ('Guaraná Jesus 2 Litros', 15.00)
  ) as v(name, price)
 where not exists (
   select 1 from public.menu_items m where m.category = 'bebida' and lower(m.name) = lower(v.name)
 );
