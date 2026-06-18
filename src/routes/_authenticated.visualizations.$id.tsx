import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatShortDate } from "@/lib/dates";
import { logActivityEvent } from "@/lib/activity-client";

// Event tracking utility
const trackEvent = (eventName: string) => {
  console.log(`[Analytics] Event tracked: ${eventName}`);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName));
  }
};

interface VisualizationDetailData {
  id: string;
  user_id: string | null;
  wallpaper_id: string | null;
  result_image_url: string;
  room_type: string | null;
  style: string | null;
  mood: string | null;
  custom_prompt: string | null;
  created_at: string;
  wallpapers?: {
    title?: string | null;
  } | null;
}

export const Route = createFileRoute("/_authenticated/visualizations/$id")({
  loader: async ({ params }) => {
    const { data: visualization, error } = await supabase
      .from("visualizations")
      .select("*, wallpapers(title)")
      .eq("id", params.id)
      .single();
    if (error || !visualization) throw notFound();
    return { visualization: visualization as unknown as VisualizationDetailData };
  },
  head: ({ loaderData }) => {
    const viz = loaderData?.visualization;
    return {
      meta: viz
        ? [
            { title: `Visualization — Murra` },
            { name: "description", content: `Visualization preview.` },
            { property: "og:image", content: viz.result_image_url },
          ]
        : [],
    };
  },
  component: VisualizationDetail,
});

function VisualizationDetail() {
  const { visualization } = Route.useLoaderData();
  const viz = visualization;
  const [copied, setCopied] = useState(false);
  const generateSimilarSearch = viz.wallpaper_id
    ? {
        wallpaper: viz.wallpaper_id,
        roomType: viz.room_type?.trim() || undefined,
        style: viz.style?.trim() || undefined,
        mood: viz.mood?.trim() || undefined,
        customPrompt: viz.custom_prompt?.trim() || undefined,
      }
    : undefined;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(viz.result_image_url);
      await logActivityEvent({
        eventType: "visualization_shared",
        entityType: "visualization",
        entityId: viz.id,
        metadata: {
          visualization_id: viz.id,
          wallpaper_id: viz.wallpaper_id,
          wallpaper_name: viz.wallpapers?.title || null,
          room_type: viz.room_type || "Visualization",
          thumbnail_url: viz.result_image_url,
        },
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.open(viz.result_image_url, "_blank");
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/visualizations"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent font-medium"
        >
          ← Back to gallery
        </Link>

        <div className="grid lg:grid-cols-12 gap-12 mt-10">
          <div className="lg:col-span-7">
            <img
              src={viz.result_image_url}
              alt={viz.wallpapers?.title || "Visualization"}
              className="w-full aspect-[4/3] object-cover shadow-2xl"
            />
          </div>
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              {viz.room_type || "Room Visualization"}
            </span>
            <h1 className="font-serif text-5xl mt-3 mb-6">
              {viz.wallpapers?.title || "AI Room Design"}
            </h1>
            {(viz.style || viz.mood) && (
              <p className="text-sm text-brand-900/65 font-medium mb-4">
                {[viz.style, viz.mood].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-xs text-brand-900/40 mb-10">
              Created {formatShortDate(viz.created_at)}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={copyShareLink}
                className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer text-center font-medium"
              >
                {copied ? "Copied Link!" : "Copy Share Link"}
              </button>
              {generateSimilarSearch && (
                <Link
                  to="/tools/wallpaper-visualizer"
                  search={generateSimilarSearch}
                  onClick={() => trackEvent("dashboard_generate_similar_clicked")}
                  className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors text-center font-medium block"
                >
                  Generate Similar
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
