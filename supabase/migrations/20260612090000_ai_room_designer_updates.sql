-- AI room designer schema
-- Creates or repairs the ai_generations table so the room generation flow can persist
-- the source wallpaper, request metadata, generated variation URLs, and optional
-- reference-generation linkage.

alter table public.companies
  add column if not exists subscription_plan text not null default 'starter',
  add column if not exists updated_at timestamp not null default now();

alter table public.profiles
  add column if not exists updated_at timestamp not null default now();

alter table public.wallpapers
  add column if not exists user_id uuid;

alter table public.visualizations
  add column if not exists user_id uuid,
  add column if not exists generation_id uuid,
  add column if not exists preview_image_url text,
  add column if not exists style text,
  add column if not exists mood text,
  add column if not exists uploaded_room_image_url text,
  add column if not exists wall_polygon jsonb,
  add column if not exists wall_detection_confidence numeric;

create index if not exists wallpapers_user_id_idx
  on public.wallpapers(user_id);

create index if not exists visualizations_user_id_idx
  on public.visualizations(user_id);

create index if not exists visualizations_generation_id_idx
  on public.visualizations(generation_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallpapers_user_id_fkey'
  ) then
    alter table public.wallpapers
      add constraint wallpapers_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visualizations_user_id_fkey'
  ) then
    alter table public.visualizations
      add constraint visualizations_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visualizations_generation_id_fkey'
  ) then
    alter table public.visualizations
      add constraint visualizations_generation_id_fkey
      foreign key (generation_id)
      references public.ai_generations(id)
      on delete set null;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists wallpapers_set_updated_at on public.wallpapers;
create trigger wallpapers_set_updated_at
  before update on public.wallpapers
  for each row
  execute function public.set_updated_at();

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  wallpaper_id uuid references public.wallpapers(id) on delete set null,
  reference_generation_id uuid,
  room_type text not null,
  style text not null,
  mood text not null,
  custom_prompt text,
  variation_count integer not null default 2,
  status text not null default 'pending',
  variation_1_url text,
  variation_2_url text,
  variation_3_url text,
  variation_4_url text,
  created_at timestamp not null default now(),
  constraint ai_generations_status_check check (status in ('pending', 'completed', 'failed'))
);

alter table public.ai_generations
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.ai_generations
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.ai_generations
  add column if not exists wallpaper_id uuid references public.wallpapers(id) on delete set null;

alter table public.ai_generations
  add column if not exists reference_generation_id uuid;

alter table public.ai_generations
  add column if not exists room_type text;

alter table public.ai_generations
  add column if not exists style text;

alter table public.ai_generations
  add column if not exists mood text;

alter table public.ai_generations
  add column if not exists custom_prompt text;

alter table public.ai_generations
  add column if not exists variation_count integer not null default 2;

alter table public.ai_generations
  add column if not exists status text not null default 'pending';

alter table public.ai_generations
  add column if not exists variation_1_url text;

alter table public.ai_generations
  add column if not exists variation_2_url text;

alter table public.ai_generations
  add column if not exists variation_3_url text;

alter table public.ai_generations
  add column if not exists variation_4_url text;

alter table public.ai_generations
  add column if not exists created_at timestamp not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_generations_status_check'
  ) then
    alter table public.ai_generations
      add constraint ai_generations_status_check
      check (status in ('pending', 'completed', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_generations_reference_generation_id_fkey'
  ) then
    alter table public.ai_generations
      add constraint ai_generations_reference_generation_id_fkey
      foreign key (reference_generation_id)
      references public.ai_generations(id)
      on delete set null;
  end if;
end $$;

create index if not exists ai_generations_company_id_idx
  on public.ai_generations(company_id);

create index if not exists ai_generations_user_id_idx
  on public.ai_generations(user_id);

create index if not exists ai_generations_wallpaper_id_idx
  on public.ai_generations(wallpaper_id);

create index if not exists ai_generations_reference_generation_id_idx
  on public.ai_generations(reference_generation_id);

create index if not exists ai_generations_status_idx
  on public.ai_generations(status);

alter table public.ai_generations enable row level security;

grant select, insert, update, delete on table public.ai_generations to authenticated;
grant select, insert, update, delete on table public.ai_generations to service_role;

drop policy if exists "Allow read ai generations for own company" on public.ai_generations;
drop policy if exists "Allow insert ai generations for own company" on public.ai_generations;
drop policy if exists "Allow update ai generations for own company" on public.ai_generations;
drop policy if exists "Allow delete ai generations for own company" on public.ai_generations;

create policy "Allow read ai generations for own company" on public.ai_generations
  for select to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow insert ai generations for own company" on public.ai_generations
  for insert to authenticated with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow update ai generations for own company" on public.ai_generations
  for update to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  ) with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "Allow delete ai generations for own company" on public.ai_generations
  for delete to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );
