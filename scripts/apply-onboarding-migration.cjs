// Apply the onboarding migration directly via Supabase Management API
const fs = require('fs');
const path = require('path');

const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdWN2Y2t2ZWRnemJkcWh5c3F2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA2MzI3OSwiZXhwIjoyMDk2NjM5Mjc5fQ.B-AUwwqMnUvCGvaGvM8pyhXSU-cINbDNsduj1nkw3KQ";
const SUPABASE_URL = "https://coucvckvedgzbdqhysqv.supabase.co";

const sql = `
-- Make companies.name nullable
ALTER TABLE public.companies ALTER COLUMN name DROP NOT NULL;

-- Add onboarding tracking fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0;

-- Ensure updated_at exists on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN new.updated_at = now(); RETURN new; END; $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: company admin can update their company name/slug
DROP POLICY IF EXISTS "Allow company admin to update own company" ON public.companies;
CREATE POLICY "Allow company admin to update own company" ON public.companies
  FOR UPDATE TO authenticated
  USING (id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Update handle_new_user: each new user gets their own personal company with name=NULL
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_company_id uuid;
  user_slug text;
BEGIN
  user_slug := 'user-' || replace(new.id::text, '-', '');
  INSERT INTO public.companies (name, slug) VALUES (null, user_slug) RETURNING id INTO new_company_id;
  INSERT INTO public.profiles (id, company_id, full_name, role, onboarding_completed, onboarding_step)
  VALUES (new.id, new_company_id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 'company_admin', false, 0)
  ON CONFLICT (id) DO UPDATE SET
    company_id = COALESCE(public.profiles.company_id, excluded.company_id),
    full_name = COALESCE(public.profiles.full_name, excluded.full_name),
    onboarding_completed = COALESCE(public.profiles.onboarding_completed, false);
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;

async function applyMigration() {
  console.log('Applying onboarding migration...');
  
  try {
    // Use the pg endpoint via Supabase REST API isn't available for raw SQL
    // Instead use the supabase-js client approach via fetch to the postgres endpoint
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      }
    });
    console.log('Supabase reachable:', response.status);
  } catch (err) {
    console.error('Cannot reach Supabase:', err.message);
    process.exit(1);
  }

  // Use Supabase Management API to execute SQL
  const PROJECT_REF = 'coucvckvedgzbdqhysqv';
  
  // Try via pg endpoint
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql })
  });
  
  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text.slice(0, 500));
}

applyMigration().catch(console.error);
