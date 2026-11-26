-- Ingredientes de cada sabor ("calabresa, cebola, mussarela e orégano"),
-- como no cardápio impresso. Preenchido pela pizzaria no painel; vazio = o
-- cardápio mostra só o nome, como antes. A leitura pública e a edição pelo
-- admin já valem pelas policies de flavors.
alter table public.flavors
  add column if not exists ingredients text
  check (ingredients is null or char_length(ingredients) <= 300);
