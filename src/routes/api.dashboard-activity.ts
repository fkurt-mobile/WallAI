import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  normalizeActivityFeedItem,
  type ActivityEventRecord,
  type ActivityMetadata,
} from "@/lib/activity";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as unknown as typeof WebSocket;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface ActivityEventsClient {
  from: (table: "activity_events") => {
    select: (columns: string) => {
      eq: (
        column: "workspace_id",
        value: string,
      ) => {
        order: (
          column: "created_at",
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: Array<{
              id: string;
              event_type: string;
              entity_type: string;
              entity_id: string | null;
              title: string | null;
              metadata: ActivityMetadata | null;
              created_at: string;
            }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
}

export const Route = createFileRoute("/api/dashboard-activity")({
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

          const activityClient = supabase as unknown as ActivityEventsClient;
          const { data, error } = await activityClient
            .from("activity_events")
            .select("id,event_type,entity_type,entity_id,title,metadata,created_at")
            .eq("workspace_id", profile.company_id)
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) throw error;

          const items = ((data || []) as ActivityEventRecord[])
            .map((row) => normalizeActivityFeedItem(row))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

          return json({ items });
        } catch (error) {
          console.error("[Dashboard Activity] Failed to load activity:", error);
          return json({ error: "Unable to load activity feed" }, 500);
        }
      },
    },
  },
});
