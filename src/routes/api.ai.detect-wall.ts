import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as any;
}

/**
 * POST /api/ai/detect-wall
 *
 * Accepts an uploadedRoomImageUrl and returns a detected wall polygon
 * with a confidence score.
 *
 * MVP: Uses a safe heuristic (centered quadrilateral ~70% width, 65% height).
 * Can be swapped for SAM / segmentation model later.
 */
export const Route = createFileRoute("/api/ai/detect-wall")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Authenticate user
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(
              JSON.stringify({ error: "Unauthorized: No token provided" }),
              { status: 401, headers: { "Content-Type": "application/json" } }
            );
          }

          const token = authHeader.replace("Bearer ", "");
          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return new Response(
              JSON.stringify({ error: "Server configuration error" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
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
            return new Response(
              JSON.stringify({ error: "Unauthorized: Invalid token" }),
              { status: 401, headers: { "Content-Type": "application/json" } }
            );
          }

          // 2. Parse request body
          let body: any;
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: "Invalid JSON body" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          const { uploadedRoomImageUrl } = body;

          if (!uploadedRoomImageUrl || typeof uploadedRoomImageUrl !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing uploadedRoomImageUrl" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          console.log(`[API detect-wall] Processing image: ${uploadedRoomImageUrl}`);

          // 3. Wall detection heuristic
          // MVP: Return a safe centered quadrilateral.
          // This mimics the common case of a flat front-facing wall.
          // Values chosen to avoid edges (trim, baseboard, ceiling cornice).
          //
          // Future: Replace with SAM-2 / Segment Anything / custom segmentation model.
          const polygon = detectWallHeuristic(uploadedRoomImageUrl);
          const confidence = 0.75;

          console.log(`[API detect-wall] Returning heuristic polygon with confidence ${confidence}`);

          return new Response(
            JSON.stringify({ polygon, confidence }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (err: any) {
          console.error("[API detect-wall] Unhandled error:", err);
          return new Response(
            JSON.stringify({ error: "Unable to detect wall. Please adjust manually." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});

/**
 * Heuristic wall detection for MVP.
 *
 * Returns a normalized polygon that covers the likely central wall area
 * in a typical interior room photo.
 *
 * Coordinates: x = point.x / imageWidth, y = point.y / imageHeight
 * All values are in [0, 1].
 */
function detectWallHeuristic(
  _imageUrl: string
): Array<{ x: number; y: number }> {
  // Default: a slightly trapezoidal quadrilateral that covers the central wall
  // in most front-facing room photos. The slight taper at top/bottom mimics
  // a typical perspective view of a flat wall.
  return [
    { x: 0.15, y: 0.12 }, // Top-Left
    { x: 0.85, y: 0.12 }, // Top-Right
    { x: 0.82, y: 0.80 }, // Bottom-Right
    { x: 0.18, y: 0.80 }, // Bottom-Left
  ];
}
