import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import {
  formatRelativeGeneratedTime,
  formatShortDate,
  parseDatabaseDate,
} from "@/lib/dates";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp, Download, Eye, Share2, Sparkles } from "lucide-react";

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

interface RecentWallpaperRecord {
  id: string;
  title: string;
  product_code: string | null;
  image_url: string;
  created_at: string;
}

interface RecentVisualizationRecord {
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

interface DashboardMetrics {
  totalWallpapers: number;
  newWallpapersMonth: number;
  totalVisualizations: number;
  sharedVisualizations: number;
  totalAiGenerations: number;
  todayAiGenerations: number;
  successRate: number | null;
  mostUsedWallpaper: string | null;
  mostUsedWallpaperCount: number;
  recentWallpapers: RecentWallpaperRecord[];
  recentDesigns: RecentVisualizationRecord[];
}

function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const recentDesignsTracked = useRef(false);

  const { data: metrics, isLoading: metricsLoading, isError: metricsError } = useQuery({
    queryKey: ["dashboard-metrics", profile?.id],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        throw new Error("No active session. Please log in.");
      }

      const response = await fetch("/api/dashboard-metrics", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let message = "Unable to load dashboard metrics.";
        try {
          const errorData = await response.json();
          if (errorData.error) message = errorData.error;
        } catch {
          // Keep the fallback message when the response is not JSON.
        }
        throw new Error(message);
      }

      return (await response.json()) as DashboardMetrics;
    },
    enabled: !!profile?.id,
    retry: false,
  });

  const recentWallpapers = metrics?.recentWallpapers || [];
  const recentDesigns = metrics?.recentDesigns || [];
  const latestViz = recentDesigns[0] || null;
  const isLoading = profileLoading || metricsLoading;
  const showSuccessRateCard = metrics?.successRate !== null;

  useEffect(() => {
    if (latestViz) {
      trackEvent("dashboard_continue_working_viewed");
    }
  }, [latestViz]);

  useEffect(() => {
    if (metrics) {
      trackEvent("dashboard_metrics_loaded");
    }
  }, [metrics]);

  useEffect(() => {
    if (metricsError) {
      trackEvent("dashboard_metrics_failed");
    }
  }, [metricsError]);

  useEffect(() => {
    if (!profile?.id || metricsLoading || recentDesignsTracked.current) return;
    recentDesignsTracked.current = true;
    trackEvent("dashboard_recent_designs_loaded");
  }, [metricsLoading, profile?.id]);

  const handleStartDesign = () => {
    trackEvent("dashboard_start_design_clicked");
    if ((metrics?.totalWallpapers || 0) === 0) {
      toast.error("Upload a wallpaper first to start generating designs.");
      navigate({ to: "/wallpapers/new" });
      return;
    }
    navigate({ to: "/tools/wallpaper-visualizer" });
  };

  const handleOpenDesign = (designId: string) => {
    trackEvent("dashboard_recent_design_opened");
    navigate({ to: "/visualizations/$id", params: { id: designId } });
  };

  const handleGenerateSimilar = (design: RecentVisualizationRecord) => {
    if (!design.wallpaper_id) {
      toast.error("This design is missing its wallpaper source.");
      return;
    }

    trackEvent("dashboard_recent_generate_similar_clicked");
    navigate({
      to: "/tools/wallpaper-visualizer",
      search: {
        wallpaper: design.wallpaper_id,
        roomType: design.room_type?.trim() || undefined,
        style: design.style?.trim() || undefined,
        mood: design.mood?.trim() || undefined,
        customPrompt: design.custom_prompt?.trim() || undefined,
      },
    });
  };

  const handleShareDesign = async (design: RecentVisualizationRecord) => {
    const shareUrl =
      typeof window === "undefined"
        ? design.result_image_url
        : `${window.location.origin}/visualizations/${design.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: design.wallpapers?.title || "Murra AI design",
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success("Design link copied.");
    } catch {
      toast.error("Unable to share this design right now.");
    }
  };

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

        <TooltipProvider delayDuration={150}>
          <div
            className={`grid gap-px bg-brand-900/5 mb-16 ${
              showSuccessRateCard ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            {metricsLoading ? (
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
                {showSuccessRateCard !== false && <StatSkeleton />}
              </>
            ) : metrics ? (
              <>
                <StatCard
                  label="Wallpapers"
                  tooltip="Total uploaded wallpapers."
                  value={String(metrics.totalWallpapers)}
                  insight={
                    metrics.totalWallpapers === 0
                      ? "Upload your first wallpaper"
                      : `+${metrics.newWallpapersMonth} this month`
                  }
                  note={
                    metrics.mostUsedWallpaper && metrics.mostUsedWallpaperCount > 0
                      ? `Most used: ${metrics.mostUsedWallpaper} · ${metrics.mostUsedWallpaperCount} visualization${metrics.mostUsedWallpaperCount === 1 ? "" : "s"}`
                      : undefined
                  }
                />
                <StatCard
                  label="Visualizations"
                  tooltip="Generated room previews."
                  value={String(metrics.totalVisualizations)}
                  insight={
                    metrics.totalVisualizations === 0
                      ? "Generate your first room"
                      : `${metrics.sharedVisualizations} shared`
                  }
                />
                <StatCard
                  label="AI Designs"
                  tooltip="Total AI generation jobs."
                  value={String(metrics.totalAiGenerations)}
                  insight={
                    metrics.totalAiGenerations === 0
                      ? "Start creating"
                      : `${metrics.todayAiGenerations} today`
                  }
                />
                {showSuccessRateCard && (
                  <StatCard
                    label="Success Rate"
                    tooltip="Completed generations divided by total requests."
                    value={`${metrics.successRate}%`}
                    insight="Generation success"
                  />
                )}
              </>
            ) : (
              <>
                <StatCard
                  label="Wallpapers"
                  tooltip="Total uploaded wallpapers."
                  value="0"
                  insight="Upload your first wallpaper"
                />
                <StatCard
                  label="Visualizations"
                  tooltip="Generated room previews."
                  value="0"
                  insight="Generate your first room"
                />
                <StatCard
                  label="AI Designs"
                  tooltip="Total AI generation jobs."
                  value="0"
                  insight="Start creating"
                />
              </>
            )}
          </div>

          {!isLoading && latestViz && (
            <section className="mb-16">
              <div className="mb-6">
                <h2 className="font-serif text-3xl italic">Continue Working</h2>
                <p className="text-xs text-brand-900/50 mt-1">
                  Resume your latest AI-generated room design.
                </p>
              </div>

              <div className="bg-card border border-brand-900/8 p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
                <div className="w-full md:w-72 aspect-[4/3] shrink-0 overflow-hidden bg-brand-100 relative group/continue-img">
                  <img
                    src={latestViz.result_image_url}
                    alt={latestViz.wallpapers?.title || "Latest design"}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover/continue-img:scale-105 animate-in fade-in"
                  />
                </div>

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

                <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0 justify-end md:items-stretch">
                  <Link
                    to="/visualizations/$id"
                    params={{ id: latestViz.id }}
                    onClick={() => trackEvent("dashboard_continue_working_opened")}
                    className="w-full bg-brand-900 text-brand-50 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors text-center font-medium shrink-0"
                  >
                    Open Design
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleGenerateSimilar(latestViz)}
                    disabled={!latestViz.wallpaper_id}
                    className="w-full border border-brand-900/15 px-8 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors text-center font-medium block shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate Similar
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="mb-16">
            <div className="flex items-end justify-between gap-6 mb-6">
              <div>
                <h2 className="font-serif text-3xl italic">Recent AI Designs</h2>
                <p className="text-sm text-brand-900/55 mt-2">
                  Your latest AI-generated interiors and room concepts.
                </p>
              </div>
              <Link
                to="/visualizations"
                className="text-[11px] uppercase tracking-[0.2em] text-accent hover:underline whitespace-nowrap"
              >
                View All →
              </Link>
            </div>

            {metricsLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
                <RecentDesignSkeleton />
                <RecentDesignSkeleton />
                <RecentDesignSkeleton />
              </div>
            ) : recentDesigns.length === 0 ? (
              <div className="border border-dashed border-brand-900/15 bg-card py-16 px-8 text-center">
                <Sparkles className="size-10 text-accent/50 mx-auto mb-5" />
                <p className="text-brand-900 font-serif text-2xl italic">No AI designs yet.</p>
                <p className="text-brand-900/55 mt-3 mb-8">
                  Upload a wallpaper and create your first AI room.
                </p>
                <button
                  type="button"
                  onClick={handleStartDesign}
                  className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
                >
                  Start New Design
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
                {recentDesigns.map((design) => (
                  <article
                    key={design.id}
                    className="group bg-card border border-brand-900/6 overflow-hidden shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]"
                  >
                    <div className="relative aspect-[5/4] overflow-hidden bg-brand-100">
                      <img
                        src={design.result_image_url}
                        alt={design.wallpapers?.title || "AI room design"}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/55 via-brand-950/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute left-4 top-4 flex items-center gap-2">
                        {getRecentDesignBadge(design.created_at) ? (
                          <span className="bg-brand-50/92 text-brand-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-medium">
                            {getRecentDesignBadge(design.created_at)}
                          </span>
                        ) : null}
                      </div>
                      <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <OverlayIconButton
                          label="View design"
                          onClick={() => handleOpenDesign(design.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </OverlayIconButton>
                        <OverlayIconLink
                          label="Download design"
                          href={design.result_image_url}
                          download
                        >
                          <Download className="h-4 w-4" />
                        </OverlayIconLink>
                        <OverlayIconButton
                          label="Share design"
                          onClick={() => void handleShareDesign(design)}
                        >
                          <Share2 className="h-4 w-4" />
                        </OverlayIconButton>
                      </div>
                    </div>

                    <div className="p-6">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium">
                        {design.room_type || "Room"}
                      </p>
                      <h3 className="font-serif text-2xl italic text-brand-900 mt-2">
                        {design.wallpapers?.title || "AI Room Design"}
                      </h3>
                      <p className="text-sm text-brand-900/50 mt-2">
                        Created {formatCreatedLabel(design.created_at)}
                      </p>

                      <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => handleOpenDesign(design.id)}
                          className="flex-1 bg-brand-900 text-brand-50 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
                        >
                          Open Design
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateSimilar(design)}
                          disabled={!design.wallpaper_id}
                          className="flex-1 border border-brand-900/15 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Generate Similar
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-end justify-between gap-6 mb-6">
              <div>
                <h2 className="font-serif text-3xl italic">Recently Added Wallpapers</h2>
                <p className="text-sm text-brand-900/55 mt-2">
                  The latest wallpapers added to your Murra catalog.
                </p>
              </div>
              <Link
                to="/wallpapers"
                className="text-[11px] uppercase tracking-[0.2em] text-accent hover:underline whitespace-nowrap"
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
                {recentWallpapers.map((wallpaper) => (
                  <Link key={wallpaper.id} to="/wallpapers" className="group">
                    <img
                      src={wallpaper.image_url}
                      alt={wallpaper.title}
                      className="aspect-square w-full object-cover outline-1 -outline-offset-1 outline-black/5 group-hover:outline-accent transition-all"
                    />
                    <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                      {wallpaper.product_code}
                    </p>
                    <p className="text-sm font-medium">{wallpaper.title}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </TooltipProvider>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  tooltip,
  value,
  insight,
  note,
}: {
  label: string;
  tooltip: string;
  value: string;
  insight: string;
  note?: string;
}) {
  return (
    <div className="bg-card p-8">
      <div className="flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">{label}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-brand-900/30 transition-colors hover:text-brand-900/55"
              aria-label={`${label} info`}
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-48 bg-brand-900 text-brand-50">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="font-serif text-5xl mt-4">{value}</p>
      <p className="mt-3 text-sm text-brand-900/65">{insight}</p>
      {note ? <p className="mt-2 text-[11px] text-brand-900/45">{note}</p> : null}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="bg-card p-8">
      <Skeleton className="h-3 w-20 bg-brand-900/8" />
      <Skeleton className="mt-4 h-12 w-16 bg-brand-900/10" />
      <Skeleton className="mt-3 h-4 w-28 bg-brand-900/8" />
      <Skeleton className="mt-2 h-3 w-36 bg-brand-900/6" />
    </div>
  );
}

function RecentDesignSkeleton() {
  return (
    <div className="overflow-hidden border border-brand-900/6 bg-card">
      <Skeleton className="aspect-[5/4] w-full bg-brand-900/8" />
      <div className="p-6">
        <Skeleton className="h-3 w-20 bg-brand-900/8" />
        <Skeleton className="mt-3 h-8 w-2/3 bg-brand-900/10" />
        <Skeleton className="mt-3 h-4 w-28 bg-brand-900/8" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-11 flex-1 bg-brand-900/10" />
          <Skeleton className="h-11 flex-1 bg-brand-900/6" />
        </div>
      </div>
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

function OverlayIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50/92 text-brand-900 backdrop-blur-sm transition-colors hover:bg-brand-50 cursor-pointer"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function OverlayIconLink({
  label,
  href,
  children,
  download,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
  download?: boolean;
}) {
  return (
    <a
      href={href}
      download={download}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50/92 text-brand-900 backdrop-blur-sm transition-colors hover:bg-brand-50"
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

function formatCreatedLabel(value: string | null | undefined): string {
  const date = parseDatabaseDate(value);
  if (!date) return "recently";

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

function getRecentDesignBadge(value: string | null | undefined): string | null {
  const date = parseDatabaseDate(value);
  if (!date) return null;

  const now = new Date();
  const sameDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();

  return sameDay ? "Generated Today" : null;
}
