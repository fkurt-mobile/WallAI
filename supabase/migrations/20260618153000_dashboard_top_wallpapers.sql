create index if not exists visualizations_user_wallpaper_created_idx
  on public.visualizations (user_id, wallpaper_id, created_at desc);

create index if not exists visualizations_company_wallpaper_created_idx
  on public.visualizations (company_id, wallpaper_id, created_at desc);

drop function if exists public.get_dashboard_top_wallpapers(uuid, integer);

create or replace function public.get_dashboard_top_wallpapers(
  p_user_id uuid,
  p_limit integer default 5
)
returns table (
  wallpaper_id uuid,
  wallpaper_name text,
  wallpaper_code text,
  thumbnail_url text,
  category text,
  visualization_count bigint,
  ai_generation_count bigint,
  last_used_at timestamp
)
language sql
stable
security invoker
set search_path = public
as $$
  with user_company as (
    select profiles.company_id
    from public.profiles
    where profiles.id = p_user_id
  ),
  scoped_visualizations as (
    select v.wallpaper_id, v.source_type, v.created_at
    from public.visualizations v
    where v.wallpaper_id is not null
      and (
        v.user_id = p_user_id
        or (
          v.user_id is null
          and exists (
            select 1
            from user_company uc
            where uc.company_id is not null
              and uc.company_id = v.company_id
          )
        )
      )
  )
  select
    w.id as wallpaper_id,
    w.title as wallpaper_name,
    w.product_code as wallpaper_code,
    w.image_url as thumbnail_url,
    w.category,
    count(*)::bigint as visualization_count,
    count(*) filter (where sv.source_type = 'ai_generated')::bigint as ai_generation_count,
    max(sv.created_at) as last_used_at
  from scoped_visualizations sv
  join public.wallpapers w on w.id = sv.wallpaper_id
  group by w.id, w.title, w.product_code, w.image_url, w.category
  order by count(*) desc, max(sv.created_at) desc
  limit greatest(coalesce(p_limit, 5), 0);
$$;
