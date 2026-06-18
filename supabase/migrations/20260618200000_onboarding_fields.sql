-- ============================================================
-- Onboarding fields for Murra Studio
-- ============================================================

-- 1. Make companies.name nullable so new users can have an unnamed company
alter table public.companies
  alter column name drop not null;

-- 2. Add onboarding tracking fields to profiles
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_hidden    boolean not null default false,
  add column if not exists onboarding_step      integer not null default 0;

-- Ensure updated_at exists on profiles (older installs may lack it)
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- 3. Add updated_at trigger for profiles if missing
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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- 4. Add slug uniqueness safety: allow multiple null-ish placeholder slugs
--    (per-user slugs are prefixed with 'user-' so real slugs won't collide)

-- 5. Allow authenticated users to update their company name/slug
--    Only the company_admin of that company can do this
drop policy if exists "Allow company admin to update own company" on public.companies;
create policy "Allow company admin to update own company" on public.companies
  for update to authenticated
  using (
    id in (
      select company_id from public.profiles
      where id = auth.uid()
      and role = 'company_admin'
    )
  )
  with check (
    id in (
      select company_id from public.profiles
      where id = auth.uid()
      and role = 'company_admin'
    )
  );

-- 6. Update handle_new_user: each new user gets their own personal company
--    with name = NULL (triggers onboarding flow)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  user_slug text;
begin
  -- Generate a unique placeholder slug for this user's company
  user_slug := 'user-' || replace(new.id::text, '-', '');

  -- Create a personal company with no name yet (null → triggers onboarding)
  insert into public.companies (name, slug)
  values (null, user_slug)
  returning id into new_company_id;

  -- Create the profile linked to the new personal company
  insert into public.profiles (id, company_id, full_name, role, onboarding_completed, onboarding_step)
  values (
    new.id,
    new_company_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'company_admin',
    false,
    0
  )
  on conflict (id) do update
  set
    company_id         = coalesce(public.profiles.company_id, excluded.company_id),
    full_name          = coalesce(public.profiles.full_name, excluded.full_name),
    onboarding_completed = coalesce(public.profiles.onboarding_completed, false);

  return new;
end;
$$;

-- Rebind trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
