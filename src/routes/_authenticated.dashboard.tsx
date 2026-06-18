import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useOnboarding } from "@/hooks/use-onboarding";
import { toast } from "sonner";
import {
  formatRelativeActivityTime,
  formatRelativeGeneratedTime,
  formatShortDate,
  parseDatabaseDate,
} from "@/lib/dates";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityFeedItem } from "@/lib/activity";
import { logActivityEvent } from "@/lib/activity-client";
import { OnboardingService } from "@/lib/onboarding";
import { StudioSetupCard } from "@/components/site/studio-setup-card";
import { OnboardingChecklist } from "@/components/site/onboarding-checklist";
import {
  ArrowRight,
  CircleHelp,
  Download,
  Eye,
  Grid2x2,
  Images,
  type LucideIcon,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

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

interface TopWallpaperRecord {
  wallpaper_id: string;
  wallpaper_name: string;
  wallpaper_code: string | null;
  thumbnail_url: string;
  category: string;
  visualization_count: number;
  ai_generation_count: number;
  last_used_at: string | null;
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
  topWallpapers: TopWallpaperRecord[];
  recentWallpapers: RecentWallpaperRecord[];
  recentDesigns: RecentVisualizationRecord[];
}

interface DashboardActivityResponse {
  items: ActivityFeedItem[];
}

function Dashboard() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recentDesignsTracked = useRef(false);
  const topWallpapersTracked = useRef(false);
  const activityTracked = useRef(false);

  // Local state: once user completes studio setup in this session we show checklist
  const [setupCompleted, setSetupCompleted] = useState(false);

  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
  } = useQuery({
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

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard-activity", profile?.id],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        throw new Error("No active session. Please log in.");
      }

      const response = await fetch("/api/dashboard-activity", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load activity feed.");
      }

      return (await response.json()) as DashboardActivityResponse;
    },
    enabled: !!profile?.id,
    retry: false,
  });

  // ── Onboarding state ─────────────────────────────────────────────────────
  const {
    isNewUser,
    hasStudioName,
    progress,
    isOnboardingHidden,
    companyId,
  } = useOnboarding({
    wallpaperCount: metrics?.totalWallpapers ?? 0,
    visualizationCount: metrics?.totalVisualizations ?? 0,
  });

  // Determine the dashboard "case" (A–E)
  const showSetupCard  = isNewUser && !hasStudioName && !setupCompleted;
  const showChecklist  = (isNewUser || setupCompleted || (hasStudioName && !isOnboardingHidden)) && !progress.isComplete;
  const showFullDash   = !showSetupCard && (hasStudioName || !isNewUser);

  const recentWallpapers = metrics?.recentWallpapers || [];
  const recentDesigns = metrics?.recentDesigns || [];
  const topWallpapers = metrics?.topWallpapers || [];
  const activityItems = activityData?.items || [];
  const latestViz = recentDesigns[0] || null;
  const isLoading = profileLoading || metricsLoading;
  const showSuccessRateCard = metrics?.successRate !== null;
  const hasWallpapers = (metrics?.totalWallpapers || 0) > 0;
  const hasVisualizations = (metrics?.totalVisualizations || 0) > 0;
  const userName = getDisplayName(profile?.full_name, profile?.email);
  const visibleRecentDesigns = recentDesigns.slice(0, 4);
  const visibleRecentWallpapers = recentWallpapers.slice(0, 6);
  const visibleTopWallpapers = topWallpapers.slice(0, 5);
  const visibleActivityItems = activityItems.slice(0, 8);

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

  useEffect(() => {
    if (!profile?.id || !metrics || metricsLoading || topWallpapersTracked.current) return;
    topWallpapersTracked.current = true;
    trackEvent("dashboard_top_wallpapers_loaded");
  }, [metrics, metricsLoading, profile?.id]);

  useEffect(() => {
    if (!profile?.id || activityLoading || activityTracked.current || !activityData) return;
    activityTracked.current = true;
    trackEvent("dashboard_activity_loaded");
  }, [activityData, activityLoading, profile?.id]);

  // Fire onboarding_started when new user lands
  const onboardingStartedRef = useRef(false);
  useEffect(() => {
    if (isNewUser && !onboardingStartedRef.current) {
      onboardingStartedRef.current = true;
      trackEvent("onboarding_started");
    }
  }, [isNewUser]);

  // Auto-complete onboarding when all 5 steps done
  useEffect(() => {
    if (progress.isComplete && profile?.id && !profile.onboarding_completed) {
      void OnboardingService.markComplete(profile.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        trackEvent("onboarding_completed");
      });
    }
  }, [progress.isComplete, profile?.id, profile?.onboarding_completed, queryClient]);

  const handleStartDesign = () => {
    trackEvent("dashboard_start_design_clicked");
    if ((metrics?.totalWallpapers || 0) === 0) {
      toast.error("Upload a wallpaper first to start generating designs.");
      navigate({ to: "/wallpapers/new" });
      return;
    }
    navigate({ to: "/tools/wallpaper-visualizer" });
  };

  const handleQuickActionAddWallpaper = () => {
    trackEvent("quick_action_add_wallpaper");
    navigate({ to: "/wallpapers/new" });
  };

  const handleQuickActionAiDesign = () => {
    trackEvent("quick_action_ai_design");

    if (!hasWallpapers) {
      toast.error("Upload a wallpaper first to generate designs.");
      navigate({ to: "/wallpapers/new" });
      return;
    }

    navigate({ to: "/tools/wallpaper-visualizer" });
  };

  const handleQuickActionBrowseVisualizations = () => {
    trackEvent("quick_action_browse_visualizations");
    navigate({ to: "/visualizations" });
  };

  const handleQuickActionWallpaperLibrary = () => {
    trackEvent("quick_action_wallpaper_library");
    navigate({ to: "/wallpapers" });
  };

  // Reordered: AI Design first, then Upload, then Browse, then Library
  const quickActions = [
    {
      key: "ai-design",
      icon: Sparkles,
      title: "Create AI Design",
      description: hasWallpapers
        ? "Generate a room visualization using AI."
        : "Upload your first wallpaper to start creating AI designs.",
      onClick: handleQuickActionAiDesign,
      ariaLabel: hasWallpapers
        ? "Create an AI room design"
        : "Upload a wallpaper first to create an AI room design",
      badge: hasWallpapers ? undefined : "Setup Required",
      emphasized: true,
    },
    {
      key: "add-wallpaper",
      icon: Upload,
      title: "Upload Wallpaper",
      description: "Upload a new wallpaper to your catalog.",
      onClick: handleQuickActionAddWallpaper,
      ariaLabel: "Add wallpaper",
    },
    {
      key: "browse-designs",
      icon: Images,
      title: "Browse Designs",
      description: "Explore your generated room designs.",
      onClick: handleQuickActionBrowseVisualizations,
      ariaLabel: "Browse generated designs",
    },
    {
      key: "wallpaper-library",
      icon: Grid2x2,
      title: "Wallpaper Library",
      description: "Manage your wallpaper collection.",
      onClick: handleQuickActionWallpaperLibrary,
      ariaLabel: "Open wallpaper library",
    },
  ];

  const handleOpenDesign = (designId: string) => {
    OnboardingService.markVisualizationViewed();
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
        OnboardingService.markVisualizationShared();
        await logVisualizationActivity("visualization_shared", design);
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      OnboardingService.markVisualizationShared();
      await logVisualizationActivity("visualization_shared", design);
      toast.success("Design link copied.");
    } catch {
      toast.error("Unable to share this design right now.");
    }
  };

  const handleOpenWallpaper = (wallpaperId: string) => {
    trackEvent("dashboard_top_wallpaper_clicked");
    navigate({
      to: "/wallpapers",
      search: { id: wallpaperId },
    });
  };

  const handleGenerateFromWallpaper = (wallpaperId: string) => {
    trackEvent("dashboard_top_wallpaper_generate_clicked");
    navigate({
      to: "/tools/wallpaper-visualizer",
      search: { wallpaper: wallpaperId },
    });
  };

  const logVisualizationActivity = async (
    eventType: "visualization_shared" | "visualization_downloaded",
    design: RecentVisualizationRecord,
    format?: string,
  ) => {
    await logActivityEvent({
      eventType,
      entityType: "visualization",
      entityId: design.id,
      metadata: {
        visualization_id: design.id,
        wallpaper_id: design.wallpaper_id,
        wallpaper_name: design.wallpapers?.title || null,
        room_type: design.room_type || "Visualization",
        format: format || null,
        thumbnail_url: design.result_image_url,
      },
    });
  };

  const handleDownloadDesign = (design: RecentVisualizationRecord) => {
    void logVisualizationActivity(
      "visualization_downloaded",
      design,
      getAssetFormat(design.result_image_url),
    );
  };

  const handleActivityClick = (item: ActivityFeedItem) => {
    trackEvent("dashboard_activity_clicked");
    trackEvent("activity_item_opened");

    if (!item.href) return;
    window.location.href = item.href;
  };

  // ── CASE A: New user, no studio name yet ─────────────────────────────────
  if (showSetupCard) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
          <TooltipProvider delayDuration={150}>
            {/* Adaptive hero for new users */}
            <section className="mb-8 overflow-hidden border border-brand-900/8 bg-card shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)]">
              <div className="bg-[radial-gradient(circle_at_top_right,rgba(196,163,110,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.9))] p-6 md:p-8">
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-accent">
                  Murra Studio
                </p>
                <h1 className="mt-3 font-serif text-3xl leading-tight text-brand-900 md:text-4xl lg:text-[2.8rem]">
                  Welcome to Murra Studio.
                </h1>
                <p className="mt-3 text-lg text-brand-900/85 md:text-xl">
                  Let's create your design workspace.
                </p>
              </div>
            </section>

            {/* Studio Setup Card */}
            <div className="mb-8 flex justify-center">
              <div className="w-full">
                <StudioSetupCard
                  companyId={companyId ?? ""}
                  onComplete={async () => {
                    setSetupCompleted(true);
                    await queryClient.invalidateQueries({ queryKey: ["user-profile"] });
                    await queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
                  }}
                />
              </div>
            </div>
          </TooltipProvider>
        </div>
      </AppShell>
    );
  }

  // ── CASE B–D: Studio named, show checklist + varying dashboard content ────
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
        <TooltipProvider delayDuration={150}>
          {/* Hero section — adapts based on onboarding state */}
          <section className="mb-8 overflow-hidden border border-brand-900/8 bg-card shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="bg-[radial-gradient(circle_at_top_right,rgba(196,163,110,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.9))] p-6 md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-accent">
                    Workspace Dashboard
                  </p>
                  <h1 className="mt-3 font-serif text-3xl leading-tight text-brand-900 md:text-4xl lg:text-[2.8rem]">
                    {isLoading ? "Good afternoon." : `Good afternoon, ${userName}.`}
                  </h1>
                  <p className="mt-3 text-lg text-brand-900/85 md:text-xl">
                    Design rooms around your wallpapers with AI.
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-900/60 md:text-base">
                    {metrics
                      ? `You have ${metrics.totalWallpapers} wallpaper${metrics.totalWallpapers === 1 ? "" : "s"} and ${metrics.totalVisualizations} visualization${metrics.totalVisualizations === 1 ? "" : "s"} in your workspace.`
                      : "Loading your wallpaper and visualization totals."}
                  </p>

                  <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
                    {quickActions.map(({ key, icon, title, description, ariaLabel, badge, onClick, emphasized }) => (
                      <QuickActionCard
                        key={key}
                        icon={icon}
                        title={title}
                        description={description}
                        ariaLabel={ariaLabel}
                        badge={badge}
                        onClick={onClick}
                        emphasized={emphasized}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Onboarding checklist (Cases B, C, D) ── */}
          {showChecklist && !isOnboardingHidden && (
            <div className="mb-8">
              <OnboardingChecklist
                progress={progress}
                onDismiss={() => {
                  queryClient.invalidateQueries({ queryKey: ["user-profile"] });
                }}
              />
            </div>
          )}

          {/* ── Case E completion badge (when checklist just finished) ── */}
          {progress.isComplete && !isOnboardingHidden && (
            <div className="mb-8">
              <OnboardingChecklist progress={progress} />
            </div>
          )}

          {/* ── Case B: Has studio name, no wallpapers — show upload CTA ── */}
          {!hasWallpapers && hasStudioName && (
            <section className="mb-8">
              <div className="border border-dashed border-brand-900/15 bg-card px-8 py-14 text-center">
                <Upload className="mx-auto mb-5 size-10 text-accent/45" />
                <p className="font-serif text-2xl italic text-brand-900">Start your wallpaper catalog.</p>
                <p className="mx-auto mt-3 max-w-xl text-brand-900/55">
                  Upload your first wallpaper to begin generating AI room designs.
                </p>
                <Link
                  to="/wallpapers/new"
                  onClick={() => trackEvent("onboarding_upload_wallpaper_cta")}
                  className="mt-8 inline-flex items-center gap-2 bg-brand-900 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                >
                  <Upload className="h-4 w-4" />
                  Upload First Wallpaper
                </Link>
              </div>
            </section>
          )}

          {/* ── Case C: Has wallpapers, no visualizations — show AI design CTA ── */}
          {hasWallpapers && !hasVisualizations && (
            <section className="mb-8">
              <div className="border border-dashed border-brand-900/15 bg-card px-8 py-14 text-center">
                <Sparkles className="mx-auto mb-5 size-10 text-accent/45" />
                <p className="font-serif text-2xl italic text-brand-900">Ready to generate your first design.</p>
                <p className="mx-auto mt-3 max-w-xl text-brand-900/55">
                  Your wallpapers are uploaded. Now transform them into AI-generated interiors.
                </p>
                <button
                  type="button"
                  onClick={handleStartDesign}
                  className="mt-8 inline-flex items-center gap-2 bg-brand-900 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate First AI Design
                </button>
              </div>
            </section>
          )}

          {/* ── Cases D & E: Has visualizations — show full dashboard ── */}
          {hasVisualizations && (
            <>
              <section className="mb-8">
                <div className="mb-5 flex items-end justify-between gap-6">
                  <div>
                    <h2 className="font-serif text-3xl italic">Continue Working</h2>
                    <p className="mt-1 text-xs text-brand-900/50">
                      Resume your latest AI-generated room design.
                    </p>
                  </div>
                </div>

                {metricsLoading ? (
                  <div className="border border-brand-900/8 bg-card p-6 shadow-sm md:p-8">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                      <Skeleton className="aspect-[4/3] w-full max-w-sm bg-brand-900/8 md:w-72" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-3 w-24 bg-brand-900/8" />
                        <Skeleton className="h-9 w-2/3 bg-brand-900/10" />
                        <Skeleton className="h-4 w-1/2 bg-brand-900/8" />
                        <Skeleton className="h-4 w-2/5 bg-brand-900/6" />
                      </div>
                      <div className="flex w-full flex-col gap-3 md:w-44">
                        <Skeleton className="h-11 w-full bg-brand-900/10" />
                        <Skeleton className="h-11 w-full bg-brand-900/6" />
                      </div>
                    </div>
                  </div>
                ) : latestViz ? (
                  <div className="border border-brand-900/8 bg-card p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] md:p-8">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
                      <div className="group/continue-img relative aspect-[4/3] w-full overflow-hidden bg-brand-100 xl:w-80 xl:shrink-0">
                        <img
                          src={latestViz.result_image_url}
                          alt={latestViz.wallpapers?.title || "Latest design"}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover/continue-img:scale-105"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
                          Latest Design
                        </p>
                        <h3 className="mt-2 font-serif text-3xl italic leading-tight text-brand-900">
                          {latestViz.wallpapers?.title || "AI Room Design"}
                        </h3>
                        <p className="mt-3 text-sm text-brand-900/55">
                          {latestViz.room_type || "Room"} · {formatRelativeGeneratedTime(latestViz.created_at)}
                        </p>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:max-w-xl">
                          <DetailRow label="Room Type" value={latestViz.room_type || "Room"} />
                          <DetailRow label="Style" value={latestViz.style || "Style"} />
                          <DetailRow label="Mood" value={latestViz.mood || "Mood"} />
                          <DetailRow label="Created" value={formatShortDate(latestViz.created_at)} />
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-48 xl:flex-col">
                        <Link
                          to="/visualizations/$id"
                          params={{ id: latestViz.id }}
                          onClick={() => {
                            trackEvent("dashboard_continue_working_opened");
                            OnboardingService.markVisualizationViewed();
                          }}
                          className="w-full bg-brand-900 px-6 py-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                        >
                          Open Design
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleGenerateSimilar(latestViz)}
                          disabled={!latestViz.wallpaper_id}
                          className="w-full border border-brand-900/15 px-6 py-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Generate Similar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)] lg:items-start">
                <div className="space-y-8">
                  <section>
                    <div className="mb-5 flex items-end justify-between gap-6">
                      <div>
                        <h2 className="font-serif text-3xl italic">Recent AI Designs</h2>
                        <p className="mt-2 text-sm text-brand-900/55">
                          Your latest AI-generated interiors and room concepts.
                        </p>
                      </div>
                      <Link
                        to="/visualizations"
                        className="whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-accent hover:underline"
                      >
                        View All →
                      </Link>
                    </div>

                    {metricsLoading ? (
                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <RecentDesignSkeleton />
                        <RecentDesignSkeleton />
                        <RecentDesignSkeleton />
                        <RecentDesignSkeleton />
                      </div>
                    ) : recentDesigns.length === 0 ? (
                      <div className="border border-dashed border-brand-900/15 bg-card px-8 py-16 text-center">
                        <Sparkles className="mx-auto mb-5 size-10 text-accent/50" />
                        <p className="font-serif text-2xl italic text-brand-900">No AI designs yet.</p>
                        <p className="mt-3 text-brand-900/55">
                          Upload a wallpaper and create your first AI room.
                        </p>
                        <button
                          type="button"
                          onClick={handleStartDesign}
                          className="mt-8 inline-flex items-center gap-2 bg-brand-900 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                        >
                          Start New Design
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {visibleRecentDesigns.map((design) => (
                          <article
                            key={design.id}
                            className="group overflow-hidden border border-brand-900/6 bg-card shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]"
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
                                  <span className="bg-brand-50/92 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-900">
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
                                  onClick={() => handleDownloadDesign(design)}
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
                              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
                                {design.room_type || "Room"}
                              </p>
                              <h3 className="mt-2 font-serif text-2xl italic text-brand-900">
                                {design.wallpapers?.title || "AI Room Design"}
                              </h3>
                              <p className="mt-2 text-sm text-brand-900/50">
                                Created {formatCreatedLabel(design.created_at)}
                              </p>

                              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDesign(design.id)}
                                  className="flex-1 bg-brand-900 px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                                >
                                  Open Design
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleGenerateSimilar(design)}
                                  disabled={!design.wallpaper_id}
                                  className="flex-1 border border-brand-900/15 px-5 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="mb-5 flex items-end justify-between gap-6">
                      <div>
                        <h2 className="font-serif text-3xl italic">Recently Added Wallpapers</h2>
                        <p className="mt-2 text-sm text-brand-900/55">
                          The latest wallpapers added to your Murra catalog.
                        </p>
                      </div>
                      <Link
                        to="/wallpapers"
                        className="whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-accent hover:underline"
                      >
                        View All →
                      </Link>
                    </div>

                    {recentWallpapers.length === 0 ? (
                      <div className="border border-dashed border-brand-900/15 bg-card px-8 py-14 text-center">
                        <p className="mb-4 font-serif text-xl italic text-brand-900/55">
                          No wallpapers in your catalog yet
                        </p>
                        <Link
                          to="/wallpapers/new"
                          className="inline-flex items-center gap-2 bg-brand-900 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-brand-50 transition-colors hover:bg-brand-800"
                        >
                          Add Your First Wallpaper
                        </Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {visibleRecentWallpapers.map((wallpaper) => (
                          <Link
                            key={wallpaper.id}
                            to="/wallpapers"
                            className="group overflow-hidden border border-brand-900/8 bg-card p-3 transition-colors hover:border-accent/35"
                          >
                            <img
                              src={wallpaper.image_url}
                              alt={wallpaper.title}
                              className="aspect-square w-full object-cover"
                            />
                            <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                              {wallpaper.product_code || "Wallpaper"}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm font-medium text-brand-900">
                              {wallpaper.title}
                            </p>
                            <p className="mt-2 text-xs text-brand-900/45">
                              Added {formatCreatedLabel(wallpaper.created_at)}
                            </p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <aside className="space-y-6 lg:sticky lg:top-24">
                  <section className="border border-brand-900/8 bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-accent">
                        Workspace Overview
                      </p>
                      <p className="mt-2 text-sm text-brand-900/55">
                        Core studio metrics and generation health.
                      </p>
                    </div>

                    {metricsLoading ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <StatSkeleton />
                        <StatSkeleton />
                        <StatSkeleton />
                        <StatSkeleton />
                      </div>
                    ) : metrics ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
                              ? `Most used: ${metrics.mostUsedWallpaper} · ${metrics.mostUsedWallpaperCount}`
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
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
                      </div>
                    )}
                  </section>

                  <section className="border border-brand-900/8 bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <h2 className="font-serif text-2xl italic">Activity Feed</h2>
                      <p className="mt-2 text-sm text-brand-900/55">
                        Recent actions across your wallpaper studio.
                      </p>
                    </div>

                    {activityLoading ? (
                      <div className="space-y-1">
                        <ActivitySkeleton />
                        <ActivitySkeleton />
                        <ActivitySkeleton />
                        <ActivitySkeleton />
                      </div>
                    ) : activityItems.length === 0 ? (
                      <div className="px-2 py-8 text-center">
                        <Sparkles className="mx-auto mb-4 size-8 text-accent/45" />
                        <p className="font-serif text-xl italic text-brand-900">No activity yet.</p>
                        <p className="mt-2 text-sm text-brand-900/55">
                          Upload your first wallpaper or generate your first AI room design.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {visibleActivityItems.map((item, index) => {
                          const Icon = getActivityIcon(item.type);
                          const rowContent = (
                            <>
                              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center border border-brand-900/10 bg-brand-50">
                                <span className="absolute left-1/2 top-full h-5 w-px -translate-x-1/2 bg-brand-900/10" />
                                <Icon className="h-4 w-4 text-brand-900/75" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-relaxed text-brand-900">{item.title}</p>
                                <p className="mt-1 text-xs text-brand-900/45">
                                  {formatRelativeActivityTime(item.created_at)}
                                </p>
                              </div>
                              {item.thumbnail_url ? (
                                <img
                                  src={item.thumbnail_url}
                                  alt=""
                                  className="hidden h-10 w-10 shrink-0 object-cover sm:block"
                                />
                              ) : null}
                            </>
                          );

                          if (item.href) {
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleActivityClick(item)}
                                className={`flex w-full items-start gap-3 rounded-none py-3 text-left transition-colors hover:bg-brand-50/60 ${
                                  index < visibleActivityItems.length - 1 ? "border-b border-brand-900/8" : ""
                                }`}
                              >
                                {rowContent}
                              </button>
                            );
                          }

                          return (
                            <div
                              key={item.id}
                              className={`flex items-start gap-3 py-3 ${
                                index < visibleActivityItems.length - 1 ? "border-b border-brand-900/8" : ""
                              }`}
                            >
                              {rowContent}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="border border-brand-900/8 bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <h2 className="font-serif text-2xl italic">Top Wallpapers</h2>
                        <p className="mt-2 text-sm text-brand-900/55">
                          Your best-performing designs at a glance.
                        </p>
                      </div>
                      <Link
                        to="/wallpapers"
                        className="whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-accent hover:underline"
                      >
                        View All →
                      </Link>
                    </div>

                    <div className="mb-4 border border-brand-900/8 bg-brand-50/70 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
                        Insight
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-brand-900/70">
                        {getTopWallpaperInsight(topWallpapers)}
                      </p>
                    </div>

                    {metricsLoading ? (
                      <div className="space-y-3">
                        <TopWallpaperSkeleton />
                        <TopWallpaperSkeleton />
                        <TopWallpaperSkeleton />
                        <TopWallpaperSkeleton />
                      </div>
                    ) : topWallpapers.length === 0 ? (
                      <div className="px-2 py-8 text-center">
                        <p className="font-serif text-xl italic text-brand-900">
                          No wallpaper performance data yet.
                        </p>
                        <p className="mt-2 text-sm text-brand-900/55">
                          Generate your first AI design to start seeing trends.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleTopWallpapers.map((wallpaper, index) => {
                          const badge = getTopWallpaperBadge(wallpaper, index);

                          return (
                            <article
                              key={wallpaper.wallpaper_id}
                              className="border border-brand-900/8 bg-white/70 p-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-brand-100">
                                  <img
                                    src={wallpaper.thumbnail_url}
                                    alt={wallpaper.wallpaper_name}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40">
                                        #{index + 1} · {wallpaper.category}
                                      </p>
                                      <h3 className="mt-1 line-clamp-2 text-sm font-medium text-brand-900">
                                        {wallpaper.wallpaper_name}
                                      </h3>
                                    </div>
                                    {badge ? (
                                      <span className="border border-amber-300/70 bg-amber-100/92 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-amber-950">
                                        {badge}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-900/55">
                                    <span>{wallpaper.visualization_count} visualizations</span>
                                    <span>{wallpaper.ai_generation_count} AI designs</span>
                                  </div>

                                  <p className="mt-2 text-xs text-brand-900/45">
                                    Last used {formatRelativeTimeLabel(wallpaper.last_used_at)}
                                  </p>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenWallpaper(wallpaper.wallpaper_id)}
                                      className="border border-brand-900/15 px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-brand-50"
                                    >
                                      Open
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateFromWallpaper(wallpaper.wallpaper_id)}
                                      className="bg-brand-900 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-brand-50 transition-colors hover:bg-brand-800"
                                    >
                                      Generate
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </TooltipProvider>
      </div>
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuickActionCard({
  icon: Icon,
  title,
  description,
  ariaLabel,
  badge,
  onClick,
  emphasized,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  ariaLabel: string;
  badge?: string;
  onClick: () => void;
  emphasized?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={description}
      className={`group inline-flex items-center gap-2.5 rounded-[13px] border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        emphasized
          ? "border-transparent bg-white/92 hover:bg-white"
          : "border-brand-900/12 bg-white/80 hover:border-accent/35 hover:bg-brand-50"
      }`}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center border border-brand-900/10 bg-brand-50 text-brand-900">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-900">
        {title}
      </span>
      {badge ? (
        <span className="border border-amber-300/70 bg-amber-100/92 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-amber-950">
          {badge}
        </span>
      ) : null}
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-brand-900/35 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent group-focus-visible:translate-x-1 group-focus-visible:text-accent" />
    </button>
  );

  if (!emphasized) {
    return button;
  }

  return (
    <div className="inline-flex rounded-[14px] bg-gradient-to-r from-amber-400 via-rose-400 to-sky-400 p-[1px] shadow-[0_14px_30px_-24px_rgba(236,72,153,0.65)]">
      {button}
    </div>
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
    <div className="border border-brand-900/8 bg-brand-50/50 p-4">
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
          <TooltipContent className="max-w-48 bg-brand-900 text-brand-50">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-3 font-serif text-4xl leading-none text-brand-900">{value}</p>
      <p className="mt-2 text-sm text-brand-900/65">{insight}</p>
      {note ? <p className="mt-2 text-[11px] leading-relaxed text-brand-900/45">{note}</p> : null}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="border border-brand-900/8 bg-brand-50/50 p-4">
      <Skeleton className="h-3 w-20 bg-brand-900/8" />
      <Skeleton className="mt-3 h-9 w-16 bg-brand-900/10" />
      <Skeleton className="mt-2 h-4 w-28 bg-brand-900/8" />
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

function TopWallpaperSkeleton() {
  return (
    <div className="border border-brand-900/8 bg-white/70 p-3">
      <div className="flex gap-3">
        <Skeleton className="h-16 w-16 shrink-0 bg-brand-900/8" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-20 bg-brand-900/8" />
          <Skeleton className="mt-2 h-5 w-3/4 bg-brand-900/10" />
          <Skeleton className="mt-3 h-3 w-2/3 bg-brand-900/8" />
          <Skeleton className="mt-2 h-3 w-1/2 bg-brand-900/6" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-8 w-16 bg-brand-900/10" />
            <Skeleton className="h-8 w-20 bg-brand-900/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3 py-3">
      <Skeleton className="h-9 w-9 bg-brand-900/8" />
      <div className="flex-1">
        <Skeleton className="h-4 w-4/5 bg-brand-900/8" />
        <Skeleton className="mt-2 h-3 w-24 bg-brand-900/6" />
      </div>
      <Skeleton className="hidden h-10 w-10 bg-brand-900/6 sm:block" />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
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
      className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-brand-50/92 text-brand-900 backdrop-blur-sm transition-colors hover:bg-brand-50"
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
  onClick,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
  download?: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      download={download}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50/92 text-brand-900 backdrop-blur-sm transition-colors hover:bg-brand-50"
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

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

function formatRelativeTimeLabel(value: string | null | undefined): string {
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

function getTopWallpaperBadge(
  wallpaper: TopWallpaperRecord,
  index: number,
): "BEST PERFORMER" | "TRENDING" | "ACTIVE" | null {
  if (index === 0) return "BEST PERFORMER";

  const lastUsed = parseDatabaseDate(wallpaper.last_used_at);
  if (!lastUsed) return null;

  const diffHours = Math.max(0, Date.now() - lastUsed.getTime()) / 3600000;
  if (wallpaper.ai_generation_count >= 2 && diffHours <= 168) return "TRENDING";
  if (diffHours <= 48) return "ACTIVE";
  return null;
}

function getTopWallpaperInsight(topWallpapers: TopWallpaperRecord[]): string {
  if (topWallpapers.length === 0) {
    return "Generate your first AI design to start seeing wallpaper trends.";
  }

  const leader = topWallpapers[0];
  if (leader.ai_generation_count > 0) {
    return `${leader.wallpaper_name} leads with ${leader.visualization_count} visualizations and ${leader.ai_generation_count} AI designs.`;
  }

  return `${leader.wallpaper_name} leads your collection with ${leader.visualization_count} visualization${leader.visualization_count === 1 ? "" : "s"}.`;
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

function getActivityIcon(type: ActivityFeedItem["type"]) {
  switch (type) {
    case "wallpaper_uploaded":
      return Upload;
    case "wallpaper_updated":
      return Pencil;
    case "wallpaper_deleted":
      return Trash2;
    case "visualization_downloaded":
      return Download;
    case "visualization_shared":
      return Share2;
    case "variation_created":
      return RefreshCw;
    case "visualization_created":
    default:
      return Sparkles;
  }
}

function getAssetFormat(url: string) {
  const cleanUrl = url.split("?")[0] || "";
  const extension = cleanUrl.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") return "JPG";
  if (extension === "webp") return "WEBP";
  return "PNG";
}

function getDisplayName(fullName: string | null | undefined, email: string | null | undefined) {
  const trimmedName = fullName?.trim();
  if (trimmedName) {
    return trimmedName.split(/\s+/)[0] || trimmedName;
  }

  const localPart = email?.split("@")[0]?.trim();
  if (localPart) {
    return localPart
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "there";
}
