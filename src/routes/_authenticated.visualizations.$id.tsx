import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { SharePanel } from "@/components/site/share-panel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/visualizations/$id")({
  loader: async ({ params }) => {
    const { data: visualization, error } = await supabase
      .from("visualizations")
      .select("*, wallpapers(title, product_code, image_url)")
      .eq("id", params.id)
      .single();

    if (error || !visualization) throw notFound();
    return { visualization };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.visualization.room_type || "Visualization"} — Murra` },
          {
            name: "description",
            content: `${loaderData.visualization.room_type || "Visualization"} generated from ${loaderData.visualization.wallpapers?.title || "this wallpaper"}.`,
          },
          {
            property: "og:image",
            content:
              loaderData.visualization.preview_image_url ||
              loaderData.visualization.result_image_url,
          },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center font-serif text-3xl italic">
      Visualization not found.
    </div>
  ),
  component: VisualizationDetailPage,
});

function VisualizationDetailPage() {
  const { visualization } = Route.useLoaderData();
  const wallpaper = visualization.wallpapers;
  const previewImageUrl = visualization.preview_image_url || visualization.result_image_url;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/visualizations"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent"
        >
          ← Back to visualizations
        </Link>

        <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-10 mt-10 items-start">
          <div className="relative bg-brand-900/5 overflow-hidden">
            <img
              src={previewImageUrl}
              alt={visualization.room_type || "Visualization"}
              className="w-full max-h-[78vh] object-cover shadow-2xl"
            />
            <div className="absolute bottom-5 left-5 bg-card/95 backdrop-blur-md p-3.5 shadow-xl border border-white/20 flex items-center gap-3 max-w-[260px]">
              {wallpaper?.image_url && (
                <img src={wallpaper.image_url} alt="" className="size-12 object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.2em] text-brand-900/40">Wallpaper</p>
                <p className="text-sm font-semibold truncate">{wallpaper?.title || "Wallpaper"}</p>
                <p className="text-[9px] text-brand-900/40 mt-0.5">
                  {visualization.room_type || "Room"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:sticky lg:top-28">
            <div className="bg-card border border-brand-900/8 p-6">
              <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium">
                AI Generated
              </p>
              <h1 className="font-serif text-5xl mt-3 leading-tight">
                {visualization.room_type || "Visualization"}
              </h1>
              <p className="text-sm text-brand-900/55 mt-3">
                {visualization.style || "Style"} · {visualization.mood || "Mood"}
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mt-4">
                Created{" "}
                {new Date(visualization.created_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>

            <div className="bg-card border border-brand-900/8 p-6 space-y-2">
              <DetailRow label="Room Type" value={visualization.room_type || "Room"} />
              <DetailRow label="Style" value={visualization.style || "Style"} />
              <DetailRow label="Mood" value={visualization.mood || "Mood"} />
              <DetailRow label="Wallpaper" value={wallpaper?.title || "Deleted wallpaper"} />
            </div>

            <SharePanel
              title="Share this visualization"
              previewImageUrl={previewImageUrl}
              shareUrl={typeof window !== "undefined" ? window.location.href : ""}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-brand-900/45 uppercase tracking-[0.16em] text-[10px]">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
