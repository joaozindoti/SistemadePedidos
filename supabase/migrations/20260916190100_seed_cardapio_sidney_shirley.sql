-- tamanhos de pizza
insert into public.menu_items (name, category, base_price, active) values
  ('Brotinho', 'pizza', 15.00, true),
  ('Pizza P (4 fatias)', 'pizza', 35.00, true),
  ('Pizza M (6 fatias)', 'pizza', 45.00, true),
  ('Pizza G (8 fatias)', 'pizza', 50.00, true),
  ('Pizza Família (12 fatias)', 'pizza', 60.00, true);

-- esfirra: item simples, sem sabor nem borda
insert into public.menu_items (name, category, base_price, active) values
  ('Esfirra', 'esfirra', 5.00, true);

-- sabores salgados
insert into public.flavors (name, flavor_type, extra_price, active) values
  ('Calabresa', 'salgada', 0, true),
  ('Mussarela', 'salgada', 0, true),
  ('Bacon', 'salgada', 0, true),
  ('Baiana', 'salgada', 0, true),
  ('Portuguesa', 'salgada', 0, true),
  ('Frango', 'salgada', 0, true),
  ('Carne de Sol', 'salgada', 0, true),
  ('Presunto', 'salgada', 0, true),
  ('Peito de Peru', 'salgada', 0, true),
  ('Três Queijos', 'salgada', 0, true),
  ('Mineira', 'salgada', 0, true),
  ('Texas', 'salgada', 0, true),
  ('Bacon com Abacaxi e Geleia', 'salgada', 0, true);

-- sabores doces
insert into public.flavors (name, flavor_type, extra_price, active) values
  ('Banana', 'doce', 0, true),
  ('Chocolate', 'doce', 0, true),
  ('Romeu e Julieta', 'doce', 0, true);
