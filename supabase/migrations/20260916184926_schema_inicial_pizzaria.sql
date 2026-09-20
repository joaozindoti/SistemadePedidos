-- ============================================
-- Schema inicial: sistema de pedidos da pizzaria
-- ============================================

create extension if not exists pg_net;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  address text,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('pizza', 'bebida')),
  base_price numeric(10,2) not null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  extra_price numeric(10,2) not null default 0,
  active boolean not null default true
);

create table public.crusts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  extra_price numeric(10,2) not null default 0,
  active boolean not null default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmado', 'preparo', 'pronto', 'saiu_entrega', 'finalizado')),
  order_type text not null check (order_type in ('entrega', 'retirada')),
  estimated_minutes integer,
  total numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  flavor_id uuid references public.flavors(id),
  crust_id uuid references public.crusts(id),
  quantity integer not null default 1,
  unit_price numeric(10,2) not null,
  item_notes text
);

create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  status text not null default 'desconectado'
    check (status in ('desconectado', 'conectando', 'conectado')),
  qr_code text,
  connected_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_orders_status on public.orders(status);
create index idx_order_items_order_id on public.order_items(order_id);
create index idx_customers_phone on public.customers(phone);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    perform net.http_post(
      url := 'https://SEU_N8N_HOST/webhook/order-status',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'order_id', new.id,
        'status', new.status,
        'order_type', new.order_type,
        'estimated_minutes', new.estimated_minutes,
        'customer_id', new.customer_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_order_status
after update on public.orders
for each row execute function public.notify_order_status_change();

alter table public.customers enable row level security;
alter table public.menu_items enable row level security;
alter table public.flavors enable row level security;
alter table public.crusts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.whatsapp_instances enable row level security;

create policy "cardapio publico" on public.menu_items for select using (active = true);
create policy "sabores publicos" on public.flavors for select using (active = true);
create policy "bordas publicas" on public.crusts for select using (active = true);

-- pedidos, itens e clientes NÃO têm policy de insert pro client anônimo.
-- toda escrita passa pela Edge Function create-order, que usa a service role key
-- (bypassa RLS) depois de validar o token assinado vindo do link do WhatsApp.

create policy "admin le tudo" on public.orders for select using (auth.role() = 'authenticated');
create policy "admin atualiza status" on public.orders for update using (auth.role() = 'authenticated');
create policy "admin le itens" on public.order_items for select using (auth.role() = 'authenticated');
create policy "admin le clientes" on public.customers for select using (auth.role() = 'authenticated');
create policy "admin gerencia whatsapp" on public.whatsapp_instances for all using (auth.role() = 'authenticated');
