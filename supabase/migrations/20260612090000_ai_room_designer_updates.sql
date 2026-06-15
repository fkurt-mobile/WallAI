-- Store AI room designer metadata on visualization records.
alter table public.visualizations
  add column if not exists style text,
  add column if not exists mood text,
  add column if not exists custom_prompt text;
