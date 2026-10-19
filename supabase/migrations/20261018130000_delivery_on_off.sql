-- Liga/desliga o delivery pelo painel (2026-10-18). Desligado, o cardápio só
-- aceita retirada e o create-order recusa pedido de entrega.
alter table public.loja_config
  add column if not exists delivery_ativo boolean not null default true;
