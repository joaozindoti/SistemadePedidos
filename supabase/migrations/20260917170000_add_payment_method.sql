alter table public.orders add column payment_method text not null default 'dinheiro' check (payment_method in ('dinheiro', 'cartao', 'pix'));
alter table public.orders alter column payment_method drop default;
