import { supabase } from "@/integrations/supabase/client";

export interface ProfileWithCompany {
  id: string;
  company_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  onboarding_completed: boolean;
  onboarding_hidden: boolean;
  onboarding_step: number;
  created_at: string;
  updated_at: string;
  email?: string;
  companies: {
    id: string;
    name: string | null;
    slug: string;
    subscription_plan: string;
    created_at: string;
    updated_at: string;
  } | null;
}



export const ProfileService = {
  async getCurrentProfile(): Promise<ProfileWithCompany> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, company_id, full_name, avatar_url, role, onboarding_completed, onboarding_hidden, onboarding_step, created_at, updated_at, companies(id, name, slug, subscription_plan, created_at, updated_at)",
      )
      .eq("id", user.id)
      .single();

    if (error) {
      throw error;
    }

    return {
      ...profile,
      email: user.email,
    } as unknown as ProfileWithCompany;
  },

  async updateProfile(fullName: string): Promise<void> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) throw error;
  },
};

export const CompanyService = {
  async updateCompany(companyId: string, name: string, slug: string): Promise<void> {
    const { error } = await supabase
      .from("companies")
      .update({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (error) throw error;
  },
};

export const AuthService = {
  async changePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
};


