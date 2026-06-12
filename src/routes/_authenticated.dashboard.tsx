import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Murra" },
      { name: "description", content: "Your Murra studio overview." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const companyId = profile?.company_id;

  // Fetch wallpapers count
  const { data: wallpapersCount = 0 } = useQuery({
    queryKey: ["wallpapers-count", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;
      const { count, error } = await supabase
        .from("wallpapers")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.company_id,
  });

  // Fetch visualizations count
  const { data: visualizationsCount = 0 } = useQuery({
    queryKey: ["visualizations-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("visualizations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.id,
  });

  // Fetch AI generations count
  const { data: aiGenerationsCount = 0 } = useQuery({
    queryKey: ["ai-generations-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("ai_generations" as any)
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!profile?.id,
  });

  // Fetch recently added wallpapers
  const { data: recentWallpapers = [], isLoading: wallpapersLoading } = useQuery({
    queryKey: ["recent-wallpapers", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const isLoading = profileLoading || wallpapersLoading;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              {isLoading
                ? "Loading..."
                : `Welcome back, ${profile?.full_name || profile?.email || "User"}`}
            </span>
            <h1 className="font-serif text-5xl md:text-6xl mt-3">Your studio.</h1>
          </div>
          <div className="flex gap-3">
            <Link
              to="/wallpapers/new"
              className="border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors"
            >
              Add Wallpaper
            </Link>
            <Link
              to="/tools/wallpaper-visualizer"
              className="bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              ✨ AI Room Designer
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-px bg-brand-900/5 mb-16">
          <Stat label="Wallpapers in catalog" value={isLoading ? "..." : String(wallpapersCount)} />
          <Stat
            label="Visualizations this month"
            value={isLoading ? "..." : String(visualizationsCount)}
          />
          <Stat label="AI designs generated" value={isLoading ? "..." : String(aiGenerationsCount)} />
        </div>

        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-serif text-3xl italic">Recently Added</h2>
          <Link
            to="/wallpapers"
            className="text-[11px] uppercase tracking-[0.2em] text-accent hover:underline"
          >
            View all →
          </Link>
        </div>

        {recentWallpapers.length === 0 ? (
          <div className="border border-dashed border-brand-900/15 bg-card py-16 px-8 text-center">
            <p className="text-brand-900/50 font-serif text-xl italic mb-4">
              No wallpapers in your catalog yet
            </p>
            <Link
              to="/wallpapers/new"
              className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              Add Your First Wallpaper
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {recentWallpapers.map((w) => (
              <Link key={w.id} to="/wallpapers" className="group">
                <img
                  src={w.image_url}
                  alt={w.title}
                  className="aspect-square w-full object-cover outline-1 -outline-offset-1 outline-black/5 group-hover:outline-accent transition-all"
                />
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                  {w.product_code}
                </p>
                <p className="text-sm font-medium">{w.title}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">{label}</p>
      <p className="font-serif text-5xl mt-4">{value}</p>
    </div>
  );
}
