import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as unknown as typeof WebSocket;
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
  topWallpapers: TopWallpaperMetric[];
  recentWallpapers: Array<{
    id: string;
    title: string;
    product_code: string | null;
    image_url: string;
    created_at: string;
  }>;
  recentDesigns: Array<{
    id: string;
    user_id: string | null;
    wallpaper_id: string | null;
    result_image_url: string;
    room_type: string | null;
    style: string | null;
    mood: string | null;
    custom_prompt: string | null;
    created_at: string;
    wallpapers?: { title?: string | null } | { title?: string | null }[] | null;
  }>;
}

interface RecentDesignRow {
  id: string;
  user_id: string | null;
  wallpaper_id: string | null;
  result_image_url: string;
  room_type: string | null;
  style: string | null;
  mood: string | null;
  custom_prompt?: string | null;
  created_at: string;
  wallpapers?: { title?: string | null } | { title?: string | null }[] | null;
}

interface TopWallpaperMetric {
  wallpaper_id: string;
  wallpaper_name: string;
  wallpaper_code: string | null;
  thumbnail_url: string;
  category: string;
  visualization_count: number;
  ai_generation_count: number;
  last_used_at: string | null;
}

interface TopWallpaperRpcRow {
  wallpaper_id: string;
  wallpaper_name: string;
  wallpaper_code: string | null;
  thumbnail_url: string;
  category: string;
  visualization_count: number | string;
  ai_generation_count: number | string;
  last_used_at: string | null;
}

interface TopWallpaperJoinRow {
  id?: string | null;
  title?: string | null;
  product_code?: string | null;
  image_url?: string | null;
  category?: string | null;
}

interface TopWallpaperFallbackRow {
  wallpaper_id: string | null;
  source_type: string | null;
  created_at: string;
  wallpapers?: TopWallpaperJoinRow | TopWallpaperJoinRow[] | null;
}

interface VisualizationShareClient {
  from: (table: "visualizations") => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        or: (filters: string) => Promise<{
          count: number | null;
          error: { message?: string } | null;
        }>;
      };
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: Array<{
          wallpaper_id: string | null;
          wallpapers?: { title?: string | null } | { title?: string | null }[] | null;
        }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
}

interface AiGenerationsMetricsClient {
  from: (table: "ai_generations") => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        gte?: (
          column: string,
          value: string,
        ) => Promise<{
          count: number | null;
          error: { message?: string } | null;
        }>;
      };
      gte?: (
        column: string,
        value: string,
      ) => Promise<{
        count: number | null;
        error: { message?: string } | null;
      }>;
      then?: never;
      order?: never;
    };
  };
}

interface AiGenerationStatusClient {
  from: (table: "ai_generations") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: Array<{ status?: string | null }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
}

interface TopWallpapersRpcClient {
  rpc: (
    fn: "get_dashboard_top_wallpapers",
    args: { p_user_id: string; p_limit: number },
  ) => Promise<{
    data: TopWallpaperRpcRow[] | null;
    error: { message?: string } | null;
  }>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getMonthStartIso() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return monthStart.toISOString();
}

function getTodayStartIso() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return todayStart.toISOString();
}

function normalizeWallpaperTitle(
  wallpapers: { title?: string | null } | { title?: string | null }[] | null | undefined,
) {
  if (!wallpapers) return null;
  if (Array.isArray(wallpapers)) return wallpapers[0]?.title ?? null;
  return wallpapers.title ?? null;
}

function normalizeWallpaperJoin(
  wallpapers: TopWallpaperJoinRow | TopWallpaperJoinRow[] | null | undefined,
) {
  if (!wallpapers) return null;
  if (Array.isArray(wallpapers)) return wallpapers[0] ?? null;
  return wallpapers;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export const Route = createFileRoute("/api/dashboard-metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return json({ error: "Unauthorized: No token provided" }, 401);
          }

          const token = authHeader.replace("Bearer ", "");
          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return json({ error: "Server configuration error" }, 500);
          }

          const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();

          if (authError || !user) {
            return json({ error: "Unauthorized: Invalid token" }, 401);
          }

          const monthStartIso = getMonthStartIso();
          const todayStartIso = getTodayStartIso();

          const fetchTopWallpapers = async (): Promise<TopWallpaperMetric[]> => {
            try {
              const rpcClient = supabase as unknown as TopWallpapersRpcClient;
              const { data, error } = await rpcClient.rpc("get_dashboard_top_wallpapers", {
                p_user_id: user.id,
                p_limit: 5,
              });

              if (error) throw error;

              return (data || []).map((row) => ({
                wallpaper_id: row.wallpaper_id,
                wallpaper_name: row.wallpaper_name,
                wallpaper_code: row.wallpaper_code,
                thumbnail_url: row.thumbnail_url,
                category: row.category,
                visualization_count: toNumber(row.visualization_count),
                ai_generation_count: toNumber(row.ai_generation_count),
                last_used_at: row.last_used_at,
              }));
            } catch (error) {
              console.warn(
                "[Dashboard Metrics] Falling back to non-RPC top wallpapers query:",
                error,
              );

              const { data, error: fallbackError } = await supabase
                .from("visualizations")
                .select(
                  "wallpaper_id, source_type, created_at, wallpapers(id, title, product_code, image_url, category)",
                )
                .eq("user_id", user.id)
                .not("wallpaper_id", "is", null)
                .order("created_at", { ascending: false });

              if (fallbackError) throw fallbackError;

              const grouped = new Map<string, TopWallpaperMetric>();
              for (const row of (data || []) as TopWallpaperFallbackRow[]) {
                if (!row.wallpaper_id) continue;
                const wallpaper = normalizeWallpaperJoin(row.wallpapers);
                if (!wallpaper?.id || !wallpaper.title || !wallpaper.image_url || !wallpaper.category) {
                  continue;
                }

                const existing = grouped.get(row.wallpaper_id);
                if (existing) {
                  existing.visualization_count += 1;
                  if (row.source_type === "ai_generated") {
                    existing.ai_generation_count += 1;
                  }
                  if (
                    row.created_at &&
                    (!existing.last_used_at ||
                      new Date(row.created_at).getTime() > new Date(existing.last_used_at).getTime())
                  ) {
                    existing.last_used_at = row.created_at;
                  }
                  continue;
                }

                grouped.set(row.wallpaper_id, {
                  wallpaper_id: row.wallpaper_id,
                  wallpaper_name: wallpaper.title,
                  wallpaper_code: wallpaper.product_code ?? null,
                  thumbnail_url: wallpaper.image_url,
                  category: wallpaper.category,
                  visualization_count: 1,
                  ai_generation_count: row.source_type === "ai_generated" ? 1 : 0,
                  last_used_at: row.created_at,
                });
              }

              return Array.from(grouped.values())
                .sort((a, b) => {
                  if (b.visualization_count !== a.visualization_count) {
                    return b.visualization_count - a.visualization_count;
                  }

                  return (
                    new Date(b.last_used_at || 0).getTime() -
                    new Date(a.last_used_at || 0).getTime()
                  );
                })
                .slice(0, 5);
            }
          };

          const fetchRecentDesigns = async (): Promise<{
            data: RecentDesignRow[] | null;
            error: { message?: string } | null;
          }> => {
            const withCustomPrompt = await supabase
              .from("visualizations")
              .select(
                "id, user_id, wallpaper_id, result_image_url, room_type, style, mood, custom_prompt, created_at, wallpapers(title)",
              )
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(6);

            if (!withCustomPrompt.error) {
              return withCustomPrompt as {
                data: RecentDesignRow[] | null;
                error: { message?: string } | null;
              };
            }

            if (!withCustomPrompt.error.message?.includes("custom_prompt")) {
              return withCustomPrompt as {
                data: RecentDesignRow[] | null;
                error: { message?: string } | null;
              };
            }

            return (await supabase
              .from("visualizations")
              .select(
                "id, user_id, wallpaper_id, result_image_url, room_type, style, mood, created_at, wallpapers(title)",
              )
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(6)) as {
              data: RecentDesignRow[] | null;
              error: { message?: string } | null;
            };
          };

          const [
            wallpapersTotalResult,
            wallpapersMonthResult,
            visualizationsTotalResult,
            mostUsedWallpaperResult,
            topWallpapersResult,
            recentWallpapersResult,
            recentDesignsResult,
          ] = await Promise.all([
            supabase
              .from("wallpapers")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id),
            supabase
              .from("wallpapers")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id)
              .gte("created_at", monthStartIso),
            supabase
              .from("visualizations")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id),
            (supabase as unknown as VisualizationShareClient)
              .from("visualizations")
              .select("wallpaper_id, wallpapers(title)")
              .eq("user_id", user.id),
            fetchTopWallpapers(),
            supabase
              .from("wallpapers")
              .select("id, title, product_code, image_url, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(6),
            fetchRecentDesigns(),
          ]);

          if (wallpapersTotalResult.error) throw wallpapersTotalResult.error;
          if (wallpapersMonthResult.error) throw wallpapersMonthResult.error;
          if (visualizationsTotalResult.error) throw visualizationsTotalResult.error;
          if (mostUsedWallpaperResult.error) throw mostUsedWallpaperResult.error;
          if (recentWallpapersResult.error) throw recentWallpapersResult.error;
          if (recentDesignsResult.error) throw recentDesignsResult.error;

          let sharedVisualizations = 0;
          try {
            const shareClient = supabase as unknown as VisualizationShareClient;
            const { count, error } = await shareClient
              .from("visualizations")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id)
              .or("share_link_created.eq.true,share_count.gt.0");

            if (!error) {
              sharedVisualizations = count || 0;
            }
          } catch {
            sharedVisualizations = 0;
          }

          let totalAiGenerations = 0;
          let todayAiGenerations = 0;
          let successRate: number | null = null;

          try {
            const aiMetricsClient = supabase as unknown as AiGenerationsMetricsClient;
            const aiStatusClient = supabase as unknown as AiGenerationStatusClient;

            const [aiTotalResult, aiTodayResult, aiStatusResult] = await Promise.all([
              aiMetricsClient
                .from("ai_generations")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id),
              aiMetricsClient
                .from("ai_generations")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .gte?.("created_at", todayStartIso),
              aiStatusClient.from("ai_generations").select("status").eq("user_id", user.id),
            ]);

            if (!aiTotalResult.error) {
              totalAiGenerations = aiTotalResult.count || 0;
            }

            if (aiTodayResult && !aiTodayResult.error) {
              todayAiGenerations = aiTodayResult.count || 0;
            }

            if (!aiStatusResult.error && aiStatusResult.data && aiStatusResult.data.length > 0) {
              const successfulGenerations = aiStatusResult.data.filter(
                (row) => row.status === "completed",
              ).length;
              successRate = Math.round((successfulGenerations / aiStatusResult.data.length) * 100);
            }
          } catch {
            totalAiGenerations = 0;
            todayAiGenerations = 0;
            successRate = null;
          }

          const wallpaperUsage = new Map<string, { title: string; count: number }>();
          for (const row of mostUsedWallpaperResult.data || []) {
            if (!row.wallpaper_id) continue;
            const title = normalizeWallpaperTitle(row.wallpapers);
            if (!title) continue;

            const existing = wallpaperUsage.get(row.wallpaper_id);
            if (existing) {
              existing.count += 1;
              continue;
            }

            wallpaperUsage.set(row.wallpaper_id, { title, count: 1 });
          }

          let mostUsedWallpaper: string | null = null;
          let mostUsedWallpaperCount = 0;
          for (const usage of wallpaperUsage.values()) {
            if (usage.count > mostUsedWallpaperCount) {
              mostUsedWallpaper = usage.title;
              mostUsedWallpaperCount = usage.count;
            }
          }

          const payload: DashboardMetrics = {
            totalWallpapers: wallpapersTotalResult.count || 0,
            newWallpapersMonth: wallpapersMonthResult.count || 0,
            totalVisualizations: visualizationsTotalResult.count || 0,
            sharedVisualizations,
            totalAiGenerations,
            todayAiGenerations,
            successRate,
            mostUsedWallpaper,
            mostUsedWallpaperCount,
            topWallpapers: topWallpapersResult,
            recentWallpapers: recentWallpapersResult.data || [],
            recentDesigns:
              recentDesignsResult.data?.map((design) => ({
                ...design,
                wallpapers: design.wallpapers
                  ? { title: normalizeWallpaperTitle(design.wallpapers) }
                  : null,
              })) || [],
          };

          return json(payload);
        } catch (error) {
          console.error("[Dashboard Metrics] Failed to load metrics:", error);
          return json({ error: "Unable to load dashboard metrics" }, 500);
        }
      },
    },
  },
});
