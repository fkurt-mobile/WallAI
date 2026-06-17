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

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          if (profileError || !profile?.company_id) {
            return json({ error: "Profile or company not found" }, 404);
          }

          const companyId = profile.company_id;
          const monthStartIso = getMonthStartIso();
          const todayStartIso = getTodayStartIso();

          const [
            wallpapersTotalResult,
            wallpapersMonthResult,
            visualizationsTotalResult,
            mostUsedWallpaperResult,
          ] = await Promise.all([
            supabase
              .from("wallpapers")
              .select("*", { count: "exact", head: true })
              .eq("company_id", companyId),
            supabase
              .from("wallpapers")
              .select("*", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("created_at", monthStartIso),
            supabase
              .from("visualizations")
              .select("*", { count: "exact", head: true })
              .eq("company_id", companyId),
            (supabase as unknown as VisualizationShareClient)
              .from("visualizations")
              .select("wallpaper_id, wallpapers(title)")
              .eq("company_id", companyId),
          ]);

          if (wallpapersTotalResult.error) throw wallpapersTotalResult.error;
          if (wallpapersMonthResult.error) throw wallpapersMonthResult.error;
          if (visualizationsTotalResult.error) throw visualizationsTotalResult.error;
          if (mostUsedWallpaperResult.error) throw mostUsedWallpaperResult.error;

          let sharedVisualizations = 0;
          try {
            const shareClient = supabase as unknown as VisualizationShareClient;
            const { count, error } = await shareClient
              .from("visualizations")
              .select("*", { count: "exact", head: true })
              .eq("company_id", companyId)
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
                .eq("company_id", companyId),
              aiMetricsClient
                .from("ai_generations")
                .select("*", { count: "exact", head: true })
                .eq("company_id", companyId)
                .gte?.("created_at", todayStartIso),
              aiStatusClient.from("ai_generations").select("status").eq("company_id", companyId),
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
