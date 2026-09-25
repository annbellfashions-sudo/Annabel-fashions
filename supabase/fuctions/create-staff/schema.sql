-- Annbell Fashions and Design — full database schema
-- Run this ONCE in a brand-new Supabase project: Dashboard → SQL Editor → New query → paste all → Run.

-- ============ CORE TABLES ============

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text default 'cashier',
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  price numeric(10,2) not null,
  cost_price numeric(10,2) default 0,
  stock_quantity integer default 0,
  reorder_level integer default 10,
  barcode text unique,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  total_spent numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  total numeric(12,2) not null,
  amount_paid numeric(12,2),
  payment_method text default 'cash',
  status text default 'completed',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2),
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.sales_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  service_id uuid references public.services(id),
  item_type text default 'product',
  quantity integer not null,
  unit_price numeric(10,2) not null,
  cost_price numeric(10,2) default 0,
  subtotal numeric(12,2) not null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  items_supplied text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id),
  vendor_name text,
  status text default 'draft',
  total numeric(12,2) default 0,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity integer not null,
  unit_cost numeric(10,2) not null,
  subtotal numeric(12,2) not null
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric(12,2) not null,
  expense_date date default current_date,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.shop_settings (
  id int primary key default 1,
  name text not null default 'Annbell Fashions and Design',
  address text not null default '',
  logo_url text,
  receipt_footer text default 'Thank you for choosing us',
  updated_at timestamptz default now(),
  constraint singleton check (id = 1)
);
insert into public.shop_settings (id) values (1) on conflict (id) do nothing;

-- ============ HELPER FUNCTION ============

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sales_items enable row level security;
alter table public.services enable row level security;
alter table public.vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.shop_settings enable row level security;

-- Profiles
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admin read all profiles" on public.profiles for select using (public.is_admin());
create policy "Admin update all profiles" on public.profiles for update using (public.is_admin());

-- Products: everyone authenticated can read/add/restock; only admin edits/deletes
create policy "Authenticated read products" on public.products for select using (auth.role() = 'authenticated');
create policy "Authenticated insert products" on public.products for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update products" on public.products for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Admin delete products" on public.products for delete using (public.is_admin());

-- Customers: full CRUD for authenticated (admin-only tab in the UI)
create policy "Authenticated read customers" on public.customers for select using (auth.role() = 'authenticated');
create policy "Authenticated write customers" on public.customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Sales: insert/update open; delete restricted to own sale or admin
create policy "Authenticated read sales" on public.sales for select using (auth.role() = 'authenticated');
create policy "Authenticated insert sales" on public.sales for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update sales" on public.sales for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Delete own or admin sales" on public.sales for delete using (created_by = auth.uid() or public.is_admin());

-- Sales items: follow the same permissive read/write/delete as sales
create policy "Authenticated read sales_items" on public.sales_items for select using (auth.role() = 'authenticated');
create policy "Authenticated write sales_items" on public.sales_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Services: admin-only writes
create policy "Authenticated read services" on public.services for select using (auth.role() = 'authenticated');
create policy "Admin insert services" on public.services for insert with check (public.is_admin());
create policy "Admin update services" on public.services for update using (public.is_admin());
create policy "Admin delete services" on public.services for delete using (public.is_admin());

-- Vendors: admin-only writes
create policy "Authenticated read vendors" on public.vendors for select using (auth.role() = 'authenticated');
create policy "Admin insert vendors" on public.vendors for insert with check (public.is_admin());
create policy "Admin update vendors" on public.vendors for update using (public.is_admin());
create policy "Admin delete vendors" on public.vendors for delete using (public.is_admin());

-- Purchase orders: admin-only writes
create policy "Authenticated read orders" on public.purchase_orders for select using (auth.role() = 'authenticated');
create policy "Admin insert orders" on public.purchase_orders for insert with check (public.is_admin());
create policy "Admin update orders" on public.purchase_orders for update using (public.is_admin());
create policy "Admin delete orders" on public.purchase_orders for delete using (public.is_admin());

create policy "Authenticated read order items" on public.purchase_order_items for select using (auth.role() = 'authenticated');
create policy "Admin insert order items" on public.purchase_order_items for insert with check (public.is_admin());
create policy "Admin delete order items" on public.purchase_order_items for delete using (public.is_admin());

-- Expenses: admin-only writes
create policy "Authenticated read expenses" on public.expenses for select using (auth.role() = 'authenticated');
create policy "Admin insert expenses" on public.expenses for insert with check (public.is_admin());
create policy "Admin update expenses" on public.expenses for update using (public.is_admin());
create policy "Admin delete expenses" on public.expenses for delete using (public.is_admin());

-- Shop settings
create policy "Authenticated read settings" on public.shop_settings for select using (auth.role() = 'authenticated');
create policy "Admin update settings" on public.shop_settings for update using (public.is_admin());

-- ============ STORAGE (product & service photos) ============

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public read product images" on storage.objects
for select using (bucket_id = 'product-images');

create policy "Authenticated upload product images" on storage.objects
for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "Authenticated update product images" on storage.objects
for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');
