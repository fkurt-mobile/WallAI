import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfile() {
  return useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      // Fetch profile
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, company_id, full_name, role")
        .eq("id", user.id)
        .single();

      if (error) {
        throw error;
      }

      return profile;
    },
  });
}
