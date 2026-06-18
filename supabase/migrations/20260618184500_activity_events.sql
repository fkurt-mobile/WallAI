create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_events_event_type_check check (
    event_type in (
      'wallpaper_uploaded',
      'visualization_created',
      'visualization_shared',
      'visualization_downloaded',
      'wallpaper_updated',
      'wallpaper_deleted',
      'variation_created'
    )
  ),
  constraint activity_events_entity_type_check check (
    entity_type in ('wallpaper', 'visualization', 'ai_generation')
  )
);

create index if not exists activity_events_workspace_created_idx
  on public.activity_events (workspace_id, created_at desc);

create index if not exists activity_events_user_created_idx
  on public.activity_events (user_id, created_at desc);

alter table public.activity_events enable row level security;

grant select, insert on public.activity_events to authenticated;
grant select, insert on public.activity_events to service_role;

drop policy if exists "Allow read activity events for own company" on public.activity_events;
create policy "Allow read activity events for own company" on public.activity_events
  for select to authenticated using (
    workspace_id in (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists "Allow insert activity events for own company" on public.activity_events;
create policy "Allow insert activity events for own company" on public.activity_events
  for insert to authenticated with check (
    workspace_id in (select company_id from public.profiles where id = auth.uid())
  );

insert into public.activity_events (
  workspace_id,
  user_id,
  event_type,
  entity_type,
  entity_id,
  title,
  metadata,
  created_at
)
select
  w.company_id,
  w.user_id,
  'wallpaper_uploaded',
  'wallpaper',
  w.id,
  concat('Uploaded wallpaper ', w.title),
  jsonb_build_object(
    'wallpaper_id', w.id,
    'wallpaper_name', w.title,
    'thumbnail_url', w.image_url
  ),
  w.created_at
from public.wallpapers w
where w.company_id is not null
  and not exists (
    select 1
    from public.activity_events ae
    where ae.event_type = 'wallpaper_uploaded'
      and ae.entity_type = 'wallpaper'
      and ae.entity_id = w.id::text
  );

insert into public.activity_events (
  workspace_id,
  user_id,
  event_type,
  entity_type,
  entity_id,
  title,
  metadata,
  created_at
)
select
  v.company_id,
  v.user_id,
  'visualization_created',
  'visualization',
  v.id,
  case
    when coalesce(v.room_type, '') <> '' and coalesce(w.title, '') <> '' then
      concat('Generated ', v.room_type, ' visualization using ', w.title)
    when coalesce(v.room_type, '') <> '' then
      concat('Generated ', v.room_type, ' visualization')
    else
      'Generated visualization'
  end,
  jsonb_build_object(
    'visualization_id', v.id,
    'wallpaper_id', v.wallpaper_id,
    'wallpaper_name', w.title,
    'room_type', v.room_type,
    'thumbnail_url', v.result_image_url,
    'variation_count', 1
  ),
  v.created_at
from public.visualizations v
left join public.wallpapers w on w.id = v.wallpaper_id
where v.company_id is not null
  and not exists (
    select 1
    from public.activity_events ae
    where ae.event_type = 'visualization_created'
      and ae.entity_type = 'visualization'
      and ae.entity_id = v.id::text
  );
