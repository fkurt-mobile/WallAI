-- Drop existing tables to recreate them according to B2B SaaS requirements
drop table if exists public.visualizations cascade;
drop table if exists public.wallpapers cascade;
drop table if exists public.profiles cascade;
drop table if exists public.mockup_rooms cascade;
drop table if exists public.companies cascade;

-- 1. Create companies table
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamp not null default now()
);

-- 2. Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  role text not null default 'company_user',
  created_at timestamp not null default now(),
  constraint profiles_role_check check (role in ('platform_admin', 'company_admin', 'company_user'))
);

-- 3. Create wallpapers table
create table public.wallpapers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  product_code text not null,
  title text not null,
  category text not null,
  image_url text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- 4. Create mockup_rooms table
create table public.mockup_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  image_url text not null,
  mask_url text,
  is_active boolean not null default true,
  created_at timestamp not null default now()
);

-- 5. Create visualizations table
create table public.visualizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  wallpaper_id uuid references public.wallpapers(id) on delete set null,
  mockup_room_id uuid references public.mockup_rooms(id) on delete set null,
  source_type text not null,
  result_image_url text not null,
  room_type text,
  created_at timestamp not null default now(),
  constraint visualizations_source_type_check check (source_type in ('ready_mockup', 'uploaded_room', 'ai_generated'))
);

-- Enable Row Level Security (RLS) on all tables
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.wallpapers enable row level security;
alter table public.mockup_rooms enable row level security;
alter table public.visualizations enable row level security;

-- Create RLS Policies

-- Companies: read allowed for authenticated users
create policy "Allow read for authenticated users" on public.companies
  for select to authenticated using (true);

-- Profiles: read/write own profile
create policy "Allow read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "Allow update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Allow insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Wallpapers: read and manage scoped to user's company
create policy "Allow read wallpapers for own company" on public.wallpapers
  for select to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow insert wallpapers for own company" on public.wallpapers
  for insert to authenticated with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow update wallpapers for own company" on public.wallpapers
  for update to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  ) with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow delete wallpapers for own company" on public.wallpapers
  for delete to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- Mockup Rooms: read allowed for authenticated users
create policy "Allow read active mockup rooms" on public.mockup_rooms
  for select to authenticated using (is_active = true);

-- Visualizations: read and manage scoped to user's company
create policy "Allow read visualizations for own company" on public.visualizations
  for select to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow insert visualizations for own company" on public.visualizations
  for insert to authenticated with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow delete visualizations for own company" on public.visualizations
  for delete to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );


-- Create trigger to automatically assign profiles & default company on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_company_id uuid;
begin
  -- Check if a default company exists, otherwise create it
  select id into default_company_id from public.companies where slug = 'heim-studio' limit 1;
  
  if default_company_id is null then
    insert into public.companies (name, slug)
    values ('Heim Studio', 'heim-studio')
    returning id into default_company_id;
  end if;

  insert into public.profiles (id, company_id, full_name, role)
  values (
    new.id,
    default_company_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'New User'),
    'company_admin'
  )
  on conflict (id) do update
  set
    company_id = coalesce(public.profiles.company_id, excluded.company_id),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

-- Bind the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- Create Storage Buckets
insert into storage.buckets (id, name, public)
values 
  ('wallpaper-images', 'wallpaper-images', true),
  ('mockup-rooms', 'mockup-rooms', true),
  ('visualization-results', 'visualization-results', true)
on conflict (id) do nothing;

-- Create Storage Policies
create policy "Public Access" on storage.objects 
  for select using (bucket_id in ('wallpaper-images', 'mockup-rooms', 'visualization-results'));

create policy "Authenticated Users Can Upload" on storage.objects 
  for insert to authenticated with check (bucket_id in ('wallpaper-images', 'mockup-rooms', 'visualization-results'));

create policy "Authenticated Users Can Update" on storage.objects 
  for update to authenticated using (bucket_id in ('wallpaper-images', 'mockup-rooms', 'visualization-results'));

create policy "Authenticated Users Can Delete" on storage.objects 
  for delete to authenticated using (bucket_id in ('wallpaper-images', 'mockup-rooms', 'visualization-results'));


-- Seed Default Data

-- 1. Insert default company
insert into public.companies (id, name, slug)
values ('d3b07384-d113-4ec5-a5d7-be2447936a71', 'Heim Studio', 'heim-studio')
on conflict (id) do nothing;

-- 2. Insert default mockup rooms
insert into public.mockup_rooms (id, name, category, image_url, is_active)
values
  ('8bc7b71a-2895-46b2-bc91-23bc07d72c1c', 'Sunlit Living', 'Living Room', '/src/assets/mockup-living.jpg', true),
  ('2d6df6cf-eb11-4cb5-8d54-15949d2cb390', 'Linen Bedroom', 'Bedroom', '/src/assets/mockup-bedroom.jpg', true),
  ('b8ccbf7a-2ee5-4b08-b80c-e2f0d922bc30', 'Oak Studio', 'Office', '/src/assets/mockup-office.jpg', true),
  ('3ee0657f-d897-4b10-8b15-99d8d6dc3e3a', 'Morning Cafe', 'Cafe', '/src/assets/mockup-cafe.jpg', true),
  ('74268ea8-36c1-4b1d-872f-48d88c227e7f', 'Banquette Room', 'Restaurant', '/src/assets/mockup-restaurant.jpg', true)
on conflict (id) do nothing;

-- 3. Insert default wallpapers (assigned to Heim Studio)
insert into public.wallpapers (id, company_id, product_code, title, category, image_url)
values
  ('0cf0b6db-bc1e-450f-a75d-8547cb0a3c20', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'EF-04-GRN', 'Ethereal Flora', 'Botanical', '/src/assets/swatch-1.jpg'),
  ('1a1a79ee-03f1-4db8-b570-3df130d2cb22', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'TC-22-CLY', 'Clay Hearth', 'Plaster', '/src/assets/swatch-2.jpg'),
  ('c7e48b8b-e85d-4f10-bf91-4d3cbdfcf5c2', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'LN-11-SND', 'Sand Drift', 'Linen', '/src/assets/swatch-3.jpg'),
  ('b4ee5bc3-eb71-4700-be87-512c1ad3a77a', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'AD-08-MAR', 'Marine Deco', 'Geometric', '/src/assets/swatch-4.jpg'),
  ('eb426dc6-df6b-426c-843e-c6c74d6c4a9a', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'VS-03-CRM', 'Ivory Line', 'Stripe', '/src/assets/swatch-5.jpg'),
  ('e1f86d8b-ef2c-461d-a3ee-8cb738a16dbd', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'BR-17-NOI', 'Sumi Brush', 'Abstract', '/src/assets/swatch-6.jpg')
on conflict (id) do nothing;

-- 4. Insert default visualizations (assigned to Heim Studio)
insert into public.visualizations (id, company_id, wallpaper_id, mockup_room_id, source_type, result_image_url, room_type)
values
  ('b6bb87d8-79c2-40a2-ba15-df78cbccda42', 'd3b07384-d113-4ec5-a5d7-be2447936a71', '0cf0b6db-bc1e-450f-a75d-8547cb0a3c20', '8bc7b71a-2895-46b2-bc91-23bc07d72c1c', 'ready_mockup', '/src/assets/result-preview.jpg', 'Living Room'),
  ('288f189c-50bc-4b08-8e68-c9c0dc2dcb80', 'd3b07384-d113-4ec5-a5d7-be2447936a71', '1a1a79ee-03f1-4db8-b570-3df130d2cb22', '2d6df6cf-eb11-4cb5-8d54-15949d2cb390', 'ready_mockup', '/src/assets/mockup-bedroom.jpg', 'Bedroom'),
  ('1e9cf0a1-77d0-40e1-adbb-1ee8cb8dcbc0', 'd3b07384-d113-4ec5-a5d7-be2447936a71', 'b4ee5bc3-eb71-4700-be87-512c1ad3a77a', '3ee0657f-d897-4b10-8b15-99d8d6dc3e3a', 'ready_mockup', '/src/assets/mockup-cafe.jpg', 'Cafe')
on conflict (id) do nothing;
