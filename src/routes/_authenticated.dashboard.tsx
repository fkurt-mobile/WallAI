import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { formatRelativeGeneratedTime, formatShortDate } from "@/lib/dates";

// Event tracking utility
const trackEvent = (eventName: string) => {
  console.log(`[Analytics] Event tracked: ${eventName}`);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName));
  }
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Murra" },
      { name: "description", content: "Your Murra studio overview." },
    ],
  }),
  component: Dashboard,
});

interface VisualizationDetailData {
  id: string;
  user_id: string | null;
  wallpaper_id: string | null;
  result_image_url: string;
  room_type: string | null;
  style: string | null;
  mood: string | null;
  created_at: string;
  wallpapers?: {
    title?: string | null;
  } | null;
}

interface AiGenerationMetadataRow {
  room_type?: string | null;
  style?: string | null;
  mood?: string | null;
  created_at?: string | null;
  variation_1_url?: string | null;
  variation_2_url?: string | null;
  variation_3_url?: string | null;
  variation_4_url?: string | null;
}

interface AiGenerationsMetadataClient {
  from: (table: "ai_generations") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => Promise<{
              data: AiGenerationMetadataRow[] | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  };
}

function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const companyId = profile?.company_id;
  const navigate = useNavigate();

  // Fetch wallpapers count
  const { data: wallpapersCount = 0 } = useQuery({
    queryKey: ["wallpapers-count", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("wallpapers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.id,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    queryKey: ["recent-wallpapers", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  // Fetch latest visualization/design for current user
  const { data: latestVisualization, isLoading: latestVizLoading } = useQuery({
    queryKey: ["latest-visualization", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from("visualizations")
        .select(
          "id, user_id, wallpaper_id, result_image_url, room_type, style, mood, created_at, wallpapers(title)",
        )
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const latest = data as unknown as VisualizationDetailData;
      if (latest.style && latest.mood) return latest;
      if (!latest.wallpaper_id) return latest;

      try {
        const aiGenerationsClient = supabase as unknown as AiGenerationsMetadataClient;
        const { data: generations, error: generationsError } = await aiGenerationsClient
          .from("ai_generations")
          .select(
            "room_type, style, mood, created_at, variation_1_url, variation_2_url, variation_3_url, variation_4_url",
          )
          .eq("user_id", profile.id)
          .eq("wallpaper_id", latest.wallpaper_id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!generationsError && generations) {
          const matchingGeneration = (generations as AiGenerationMetadataRow[]).find((generation) =>
            [
              generation.variation_1_url,
              generation.variation_2_url,
              generation.variation_3_url,
              generation.variation_4_url,
            ].includes(latest.result_image_url),
          );

          if (matchingGeneration) {
            return {
              ...latest,
              room_type: latest.room_type || matchingGeneration.room_type || null,
              style: latest.style || matchingGeneration.style || null,
              mood: latest.mood || matchingGeneration.mood || null,
              created_at: latest.created_at || matchingGeneration.created_at || "",
            };
          }
        }
      } catch {
        // Older projects may not have the ai_generations table.
      }

      return latest;
    },
    enabled: !!profile?.id,
  });

  const isLoading = profileLoading || wallpapersLoading || latestVizLoading;

  // Track continue working section viewed
  useEffect(() => {
    if (latestVisualization) {
      trackEvent("dashboard_continue_working_viewed");
    }
  }, [latestVisualization]);

  const handleStartDesign = () => {
    trackEvent("dashboard_start_design_clicked");
    if (wallpapersCount === 0) {
      toast.error("Upload a wallpaper first to start generating designs.");
      navigate({ to: "/wallpapers/new" });
    } else {
      navigate({ to: "/tools/wallpaper-visualizer" });
    }
  };

  const latestViz = latestVisualization as unknown as VisualizationDetailData;
  const latestVizSearch = latestViz?.wallpaper_id
    ? {
        wallpaper: latestViz.wallpaper_id,
        roomType: latestViz.room_type?.trim() || undefined,
        style: latestViz.style?.trim() || undefined,
        mood: latestViz.mood?.trim() || undefined,
      }
    : undefined;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-14">
          <div className="max-w-3xl">
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              {isLoading
                ? "LOADING..."
                : `WELCOME BACK, ${(profile?.full_name || profile?.email || "User").toUpperCase()}`}
            </span>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl mt-3 leading-tight text-brand-900">
              Design rooms around your wallpapers with AI.
            </h1>
            <p className="mt-4 text-brand-900/65 text-sm md:text-base max-w-2xl leading-relaxed">
              Upload wallpaper collections, generate styled interiors, and create client-ready
              visualizations in minutes.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto shrink-0 md:justify-end">
            <button
              type="button"
              onClick={handleStartDesign}
              className="w-full md:w-auto bg-brand-900 text-brand-50 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer text-center font-medium shrink-0"
            >
              Start New Design
            </button>
            <Link
              to="/wallpapers/new"
              onClick={() => trackEvent("dashboard_add_wallpaper_clicked")}
              className="w-full md:w-auto border border-brand-900/15 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors text-center font-medium block shrink-0"
            >
              Add Wallpaper
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-px bg-brand-900/5 mb-16">
          <Stat label="Wallpapers in catalog" value={isLoading ? "..." : String(wallpapersCount)} />
          <Stat
            label="Visualizations this month"
            value={isLoading ? "..." : String(visualizationsCount)}
          />
          <Stat
            label="AI designs generated"
            value={isLoading ? "..." : String(aiGenerationsCount)}
          />
        </div>

        {/* Continue Working Section */}
        {!isLoading && latestViz && (
          <section className="mb-16">
            <div className="mb-6">
              <h2 className="font-serif text-3xl italic">Continue Working</h2>
              <p className="text-xs text-brand-900/50 mt-1">
                Resume your latest AI-generated room design.
              </p>
            </div>

            <div className="bg-card border border-brand-900/8 p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
              {/* Left: Preview image */}
              <div className="w-full md:w-72 aspect-[4/3] shrink-0 overflow-hidden bg-brand-100 relative group/continue-img">
                <img
                  src={latestViz.result_image_url}
                  alt={latestViz.wallpapers?.title || "Latest design"}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover/continue-img:scale-105 animate-in fade-in"
                />
              </div>

              {/* Middle: Details */}
              <div className="flex-1 min-w-0 w-full">
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium">
                  Details
                </p>
                <h3 className="font-serif text-2xl italic text-brand-900 leading-tight mt-2 mb-5">
                  {latestViz.wallpapers?.title || "AI Room Design"}
                </h3>
                <div className="space-y-2.5 max-w-md">
                  <DetailRow label="Room Type" value={latestViz.room_type || "Room"} />
                  <DetailRow label="Style" value={latestViz.style || "Style"} />
                  <DetailRow label="Mood" value={latestViz.mood || "Mood"} />
                  <DetailRow label="Created" value={formatShortDate(latestViz.created_at)} />
                </div>
                <p className="text-xs text-accent font-medium mt-4">
                  {formatRelativeGeneratedTime(latestViz.created_at)}
                </p>
              </div>

              {/* Right: CTAs */}
              <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0 justify-end md:items-stretch">
                <Link
                  to="/visualizations/$id"
                  params={{ id: latestViz.id }}
                  onClick={() => trackEvent("dashboard_continue_working_opened")}
                  className="w-full bg-brand-900 text-brand-50 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors text-center font-medium shrink-0"
                >
                  Open Design
                </Link>
                {latestVizSearch && (
                  <Link
                    to="/tools/wallpaper-visualizer"
                    search={latestVizSearch}
                    onClick={() => trackEvent("dashboard_generate_similar_clicked")}
                    className="w-full border border-brand-900/15 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors text-center font-medium block shrink-0"
                  >
                    Generate Similar
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
