import { supabase } from "@/integrations/supabase/client";

export interface ProfileWithCompany {
  id: string;
  company_id: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
  email?: string;
  companies: {
    id: string;
    name: string;
    slug: string;
    subscription_plan: string;
    created_at: string;
    updated_at: string;
  } | null;
}

export interface UsageStats {
  wallpapersCount: number;
  visualizationsCount: number;
  mockupsCount: number;
  chartData: { date: string; count: number }[];
  recentActivity: {
    id: string;
    type: "wallpaper" | "visualization";
    title: string;
    description: string;
    date: string;
    timestamp: string;
  }[];
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
        "id, company_id, full_name, role, created_at, updated_at, companies(id, name, slug, subscription_plan, created_at, updated_at)",
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

export const UsageService = {
  async getUsageStats(userId: string, companyId: string | null): Promise<UsageStats> {
    // 1. Fetch user-specific wallpapers count
    const { count: wallpapersCount, error: wError } = await supabase
      .from("wallpapers")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (wError) throw wError;

    // 2. Fetch user-specific visualizations count
    const { count: visualizationsCount, error: vError } = await supabase
      .from("visualizations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (vError) throw vError;

    // 3. Fetch active mockup rooms count
    const { count: mockupsCount, error: mError } = await supabase
      .from("mockup_rooms")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    if (mError) throw mError;

    // 4. Fetch visualizations from the last 30 days to build a chart
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: visualizations, error: vizError } = await supabase
      .from("visualizations")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    if (vizError) throw vizError;

    // Group visualizations by date for chart representation
    const chartMap = new Map<string, number>();
    // Pre-populate last 7 days with 0s to ensure a neat chart if user is new
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      chartMap.set(label, 0);
    }

    visualizations?.forEach((v) => {
      const label = new Date(v.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      });
      chartMap.set(label, (chartMap.get(label) || 0) + 1);
    });

    const chartData = Array.from(chartMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // 5. Fetch recent activity (last 5 wallpapers + last 5 visualizations)
    const { data: recentWallpapers } = await supabase
      .from("wallpapers")
      .select("id, title, product_code, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: recentVisualizations } = await supabase
      .from("visualizations")
      .select("id, created_at, source_type, room_type, wallpapers(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    const activityFeed: UsageStats["recentActivity"] = [];

    recentWallpapers?.forEach((w) => {
      activityFeed.push({
        id: w.id,
        type: "wallpaper",
        title: `Added wallpaper "${w.title}"`,
        description: `Product code: ${w.product_code}`,
        date: new Date(w.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        timestamp: w.created_at,
      });
    });

    recentVisualizations?.forEach((v: any) => {
      const wallTitle = v.wallpapers?.title || "Wallpaper";
      const room = v.room_type || "Room";
      const source =
        v.source_type === "ready_mockup"
          ? "mockup room"
          : v.source_type === "uploaded_room"
            ? "custom room photo"
            : "AI generator";
      activityFeed.push({
        id: v.id,
        type: "visualization",
        title: `Created visualization`,
        description: `Generated preview of "${wallTitle}" in ${room} using ${source}`,
        date: new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        timestamp: v.created_at,
      });
    });

    // Sort combined feed by timestamp descending
    activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      wallpapersCount: wallpapersCount || 0,
      visualizationsCount: visualizationsCount || 0,
      mockupsCount: mockupsCount || 0,
      chartData,
      recentActivity: activityFeed.slice(0, 8),
    };
  },
};
