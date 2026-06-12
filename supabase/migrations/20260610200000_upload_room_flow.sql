-- Migration: Upload My Room flow support
-- Adds columns to visualizations table and creates uploaded-room-images bucket

-- Add missing columns to visualizations table
alter table public.visualizations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists uploaded_room_image_url text,
  add column if not exists wall_polygon jsonb,
  add column if not exists wall_detection_confidence numeric;

-- Create uploaded-room-images storage bucket
insert into storage.buckets (id, name, public)
values ('uploaded-room-images', 'uploaded-room-images', true)
on conflict (id) do nothing;

-- Storage policies for uploaded-room-images bucket
create policy "Public Access uploaded-room-images"
  on storage.objects for select
  using (bucket_id = 'uploaded-room-images');

create policy "Auth Users Upload uploaded-room-images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'uploaded-room-images');

create policy "Auth Users Update uploaded-room-images"
  on storage.objects for update to authenticated
  using (bucket_id = 'uploaded-room-images');

create policy "Auth Users Delete uploaded-room-images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'uploaded-room-images');
