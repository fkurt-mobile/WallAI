import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRoomDesign } from "@/services/grokService";
import { Buffer } from "buffer";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as any;
}

export const Route = createFileRoute("/api/ai/generate-room")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── 1. Authenticate ────────────────────────────────────────────────
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
            console.error("[Generate Room] Missing Supabase env vars");
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

          // ── 2. Profile / company ────────────────────────────────────────────
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          if (profileError || !profile?.company_id) {
            return new Response(
              JSON.stringify({ error: "Profile or company not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }

          const companyId = profile.company_id;

          // ── 3. Parse body ───────────────────────────────────────────────────
          let body: any;
          try {
            body = await request.json();
          } catch {
            return new Response(
              JSON.stringify({ error: "Invalid JSON body" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          const { wallpaperId, roomType, style, mood, customPrompt } = body;

          if (!wallpaperId || !roomType || !style || !mood) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: wallpaperId, roomType, style, mood" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // ── 4. Fetch wallpaper ──────────────────────────────────────────────
          const { data: wallpaper, error: wallpaperError } = await supabase
            .from("wallpapers")
            .select("*")
            .eq("id", wallpaperId)
            .single();

          if (wallpaperError || !wallpaper) {
            return new Response(
              JSON.stringify({ error: "Wallpaper not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }

          if (wallpaper.company_id !== companyId) {
            return new Response(
              JSON.stringify({ error: "Wallpaper not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } }
            );
          }

          if (!process.env.XAI_API_KEY) {
            return new Response(
              JSON.stringify({ error: "AI generation service is temporarily unavailable." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }

          // ── 5. Generate 4 variations in parallel ────────────────────────────
          console.log(
            `[Generate Room] Generating 4 variations for wallpaper ${wallpaperId}`,
            { roomType, style, mood }
          );

          const generateOne = async (variationIndex: number): Promise<string> => {
            console.log(`[Generate Room] Starting variation ${variationIndex + 1}...`);
            try {
              const imageUrl = await generateRoomDesign({
                wallpaperImageUrl: wallpaper.image_url,
                roomType,
                style,
                mood,
                customPrompt,
              });

              // Download the generated image
              const downloadRes = await fetch(imageUrl);
              if (!downloadRes.ok) throw new Error(`Failed to download variation ${variationIndex + 1}`);
              const arrayBuffer = await downloadRes.arrayBuffer();
              const imageBuffer = Buffer.from(arrayBuffer);

              // Upload to Supabase storage
              const fileName = `${companyId}/${Date.now()}_ai_room_v${variationIndex + 1}.jpg`;
              const { error: uploadError } = await supabase.storage
                .from("visualization-results")
                .upload(fileName, imageBuffer, {
                  contentType: "image/jpeg",
                  upsert: true,
                });

              if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

              const { data: publicUrlData } = supabase.storage
                .from("visualization-results")
                .getPublicUrl(fileName);

              console.log(`[Generate Room] Variation ${variationIndex + 1} stored: ${publicUrlData.publicUrl}`);
              return publicUrlData.publicUrl;
            } catch (err: any) {
              console.error(`[Generate Room] Variation ${variationIndex + 1} failed:`, err.message);
              throw err;
            }
          };

          // Run all 4 in parallel
          let variationUrls: string[];
          try {
            variationUrls = await Promise.all([0, 1, 2, 3].map(generateOne));
          } catch (err: any) {
            console.error("[Generate Room] One or more variations failed:", err.message);
            return new Response(
              JSON.stringify({
                error: "AI generation failed. Please try again.",
                details: err.message,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          // ── 6. Insert record into ai_generations ────────────────────────────
          console.log("[Generate Room] Inserting ai_generations record...");

          let generationId: string | null = null;
          try {
            const { data: gen, error: insertError } = await supabase
              .from("ai_generations" as any)
              .insert({
                company_id: companyId,
                user_id: user.id,
                wallpaper_id: wallpaperId,
                room_type: roomType,
                style,
                mood,
                custom_prompt: customPrompt || null,
                status: "completed",
                variation_1_url: variationUrls[0],
                variation_2_url: variationUrls[1],
                variation_3_url: variationUrls[2],
                variation_4_url: variationUrls[3],
              })
              .select("id")
              .single();

            if (!insertError && gen) {
              generationId = (gen as any).id;
            } else {
              console.warn("[Generate Room] DB insert warning:", insertError?.message);
            }
          } catch (dbErr: any) {
            // Non-fatal — we still return the URLs even if DB insert fails
            console.warn("[Generate Room] DB insert failed (non-fatal):", dbErr.message);
          }

          console.log("[Generate Room] Complete. Returning 4 variation URLs.");
          return new Response(
            JSON.stringify({
              id: generationId,
              wallpaper_id: wallpaperId,
              room_type: roomType,
              style,
              mood,
              variation_1_url: variationUrls[0],
              variation_2_url: variationUrls[1],
              variation_3_url: variationUrls[2],
              variation_4_url: variationUrls[3],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (globalError: any) {
          console.error("[Generate Room] Unhandled error:", globalError);
          return new Response(
            JSON.stringify({
              error: "Unable to generate room design. Please try again.",
              details: globalError.message,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
