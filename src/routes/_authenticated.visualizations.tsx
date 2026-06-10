import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import {
  VisualizationPreviewModal,
  type VizPreview,
} from "@/components/site/visualization-preview-modal";
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
  const [active, setActive] = useState<VizPreview | null>(null);
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;

  // Query real visualizations from Supabase
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["visualizations", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("visualizations")
        .select("*, wallpapers(title)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return data.map((v: any) => ({
        id: v.id,
        wallpaperId: v.wallpaper_id,
        wallpaperTitle: v.wallpapers?.title || "Deleted Wallpaper",
        room: v.room_type || "Room",
        date: new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        image: v.result_image_url,
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
            <h2 className="font-serif text-3xl italic mb-3">No visualizations yet</h2>
            <p className="text-brand-900/55 mb-8">
              Head to the visualizer to preview wallpapers in different rooms.
            </p>
            <Link
              to="/tools/wallpaper-visualizer"
              className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              Open Visualizer
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {list.map((v) => (
              <article
                key={v.id}
                className="bg-card border border-brand-900/8 overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] overflow-hidden bg-brand-100">
                  <img
                    src={v.image}
                    alt={v.wallpaperTitle}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                    {v.room}
                  </p>
                  <h3 className="font-serif text-2xl italic mt-2">{v.wallpaperTitle}</h3>
                  <p className="text-xs text-brand-900/50 mt-1">Created {v.date}</p>
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setActive(v)}
                      className="flex-1 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
                    >
                      View →
                    </button>
                    <button
                      onClick={() => setActive(v)}
                      className="border border-brand-900/12 px-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-50 transition-colors cursor-pointer"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <VisualizationPreviewModal
        viz={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
      />
    </AppShell>
  );
}
