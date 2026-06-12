import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/visualizations")({
  head: () => ({
    meta: [
      { title: "Visualizations — Murra" },
      { name: "description", content: "Browse all previously generated wallpaper mockups." },
    ],
  }),
  component: VisualizationsPage,
});

function VisualizationsPage() {
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;
  type VisualizationRow = {
    id: string;
    wallpaper_id: string | null;
    room_type: string | null;
    style: string | null;
    mood: string | null;
    preview_image_url: string | null;
    result_image_url: string;
    created_at: string;
    wallpapers: { title: string; product_code: string } | null;
  };

  // Query real visualizations from Supabase
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["visualizations", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("visualizations")
        .select(
          "id, wallpaper_id, room_type, style, mood, preview_image_url, result_image_url, created_at, wallpapers(title, product_code)",
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return ((data ?? []) as VisualizationRow[]).map((v) => ({
        id: v.id,
        wallpaperId: v.wallpaper_id,
        wallpaperTitle: v.wallpapers?.title || "Deleted Wallpaper",
        room: v.room_type || "Room",
        style: v.style || "Style",
        mood: v.mood || "Mood",
        date: new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        image: v.preview_image_url || v.result_image_url,
      }));
    },
    enabled: !!companyId,
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              Library
            </span>
            <h1 className="font-serif text-5xl md:text-6xl mt-3">Visualizations.</h1>
            <p className="text-brand-900/55 mt-3 max-w-md">
              Every wallpaper mockup you've generated, in one place.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-900/45">
            {isLoading ? "..." : list.length} total
          </p>
        </div>

        {isLoading ? (
          <p className="text-center font-serif text-2xl italic py-20">Loading visualizations...</p>
        ) : list.length === 0 ? (
          <div className="border border-dashed border-brand-900/15 bg-card py-24 px-8 text-center max-w-xl mx-auto">
            <h2 className="font-serif text-3xl italic mb-3">No AI designs yet</h2>
            <p className="text-brand-900/55 mb-8">
              Use the AI Room Designer to generate photorealistic interior visualizations with your
              wallpapers.
            </p>
            <Link
              to="/tools/wallpaper-visualizer"
              className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              ✨ Open AI Room Designer
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {list.map((v) => (
              <Link key={v.id} to="/visualizations/$id" params={{ id: v.id }} className="group">
                <article className="bg-card border border-brand-900/8 overflow-hidden flex flex-col h-full">
                  <div className="aspect-[4/3] overflow-hidden bg-brand-100">
                    <img
                      src={v.image}
                      alt={v.wallpaperTitle}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                      {v.room}
                    </p>
                    <h3 className="font-serif text-2xl italic mt-2">{v.wallpaperTitle}</h3>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-brand-900/55">
                        {v.style} · {v.mood}
                      </p>
                      <p className="text-xs text-brand-900/50">Created {v.date}</p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-brand-900/50 group-hover:text-accent transition-colors">
                      View →
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
