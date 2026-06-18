import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ACTIVITY_ENTITY_TYPES,
  ACTIVITY_EVENT_TYPES,
  type ActivityEntityType,
  type ActivityEventType,
  type ActivityMetadata,
  type CreateActivityEventInput,
} from "@/lib/activity";
import { createActivityEvent } from "@/lib/activity-server";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as unknown as typeof WebSocket;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidEventType(value: unknown): value is ActivityEventType {
  return typeof value === "string" && ACTIVITY_EVENT_TYPES.includes(value as ActivityEventType);
}

function isValidEntityType(value: unknown): value is ActivityEntityType {
  return typeof value === "string" && ACTIVITY_ENTITY_TYPES.includes(value as ActivityEntityType);
}

function normalizeMetadata(value: unknown): ActivityMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metadata = value as Record<string, unknown>;
  return {
    wallpaper_id: typeof metadata.wallpaper_id === "string" ? metadata.wallpaper_id : null,
    wallpaper_name: typeof metadata.wallpaper_name === "string" ? metadata.wallpaper_name : null,
    visualization_id:
      typeof metadata.visualization_id === "string" ? metadata.visualization_id : null,
    room_type: typeof metadata.room_type === "string" ? metadata.room_type : null,
    format: typeof metadata.format === "string" ? metadata.format : null,
    thumbnail_url: typeof metadata.thumbnail_url === "string" ? metadata.thumbnail_url : null,
    variation_count:
      typeof metadata.variation_count === "number" ? metadata.variation_count : null,
  };
}

export const Route = createFileRoute("/api/activity-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

          let body: CreateActivityEventInput;
          try {
            body = (await request.json()) as CreateActivityEventInput;
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }

          if (!isValidEventType(body.eventType) || !isValidEntityType(body.entityType)) {
            return json({ error: "Invalid activity event payload" }, 400);
          }

          await createActivityEvent(supabase, {
            workspaceId: profile.company_id,
            userId: user.id,
            eventType: body.eventType,
            entityType: body.entityType,
            entityId: body.entityId ?? null,
            metadata: normalizeMetadata(body.metadata),
            title: body.title ?? null,
          });

          return json({ ok: true });
        } catch (error) {
          console.error("[Activity] Failed to log activity event:", error);
          return json({ error: "Unable to log activity event" }, 500);
        }
      },
    },
  },
});
