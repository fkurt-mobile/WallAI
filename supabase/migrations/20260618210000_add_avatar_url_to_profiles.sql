ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Update trigger function to also handle avatar_url if provided
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_company_id UUID;
BEGIN
  -- Check if a default company exists, otherwise create it
  SELECT id INTO default_company_id FROM public.companies WHERE slug = 'heim-studio' LIMIT 1;
  
  IF default_company_id IS NULL THEN
    INSERT INTO public.companies (name, slug)
    VALUES ('Heim Studio', 'heim-studio')
    RETURNING id INTO default_company_id;
  END IF;

  INSERT INTO public.profiles (id, company_id, full_name, role, avatar_url)
  VALUES (
    new.id,
    default_company_id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'New User'),
    'company_admin',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    company_id = COALESCE(public.profiles.company_id, excluded.company_id),
    full_name = COALESCE(public.profiles.full_name, excluded.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = NOW();

  RETURN new;
END;
$$;
