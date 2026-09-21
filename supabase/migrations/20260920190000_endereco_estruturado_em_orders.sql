-- App só guardava o endereço em customers.address (texto livre), e esse
-- endereço ficava fixo por telefone — sobrescrito a cada pedido novo do
-- mesmo cliente, mesmo que ele peça em endereços diferentes ou faça uma
-- retirada depois. Move pra colunas estruturadas em orders, que é o lugar
-- certo (o endereço é do pedido, não do cliente). Pré-lançamento, sem
-- pedidos reais em produção — pode ser breaking change.

alter table public.customers drop column address;

alter table public.orders
  add column address_street text,
  add column address_number text,
  add column address_complement text,
  add column address_neighborhood text,
  add column address_city text;

-- Obrigatoriedade (exceto complemento) é validada na Edge Function
-- create-order, não aqui: pedido de retirada não tem endereço nenhum,
-- então não dá pra usar NOT NULL/CHECK direto na coluna.
