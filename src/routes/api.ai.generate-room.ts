import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRoomDesign } from "@/services/grokService";
import { Buffer } from "buffer";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as unknown as typeof WebSocket;
}

interface GenerateRoomBody {
  wallpaperId?: string;
  roomType?: string;
  style?: string;
  mood?: string;
  customPrompt?: string;
  variationCount?: number;
}

interface AiGenerationsInsertClient {
  from: (table: "ai_generations") => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

interface VisualizationsInsertClient {
  from: (table: "visualizations") => {
    insert: (values: Record<string, unknown>[]) => {
      select: (columns: string) => Promise<{
        data: Array<{
          id: string;
          result_image_url: string;
          room_type?: string | null;
          style?: string | null;
          mood?: string | null;
          created_at?: string | null;
        }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const Route = createFileRoute("/api/ai/generate-room")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── 1. Authenticate ────────────────────────────────────────────────
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized: No token provided" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const token = authHeader.replace("Bearer ", "");

          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            console.error("[Generate Room] Missing Supabase env vars");
            return new Response(JSON.stringify({ error: "Server configuration error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
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
            return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // ── 2. Profile / company ────────────────────────────────────────────
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          if (profileError || !profile?.company_id) {
            return new Response(JSON.stringify({ error: "Profile or company not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const companyId = profile.company_id;

          // ── 3. Parse body ───────────────────────────────────────────────────
          let body: GenerateRoomBody;
          try {
            body = (await request.json()) as GenerateRoomBody;
          } catch {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { wallpaperId, roomType, style, mood, customPrompt } = body;
          const requestedVariationCount = Number(body.variationCount);
          const variationCount =
            Number.isInteger(requestedVariationCount) &&
            requestedVariationCount >= 1 &&
            requestedVariationCount <= 4
              ? requestedVariationCount
              : 2;

          if (!wallpaperId || !roomType || !style || !mood) {
            return new Response(
              JSON.stringify({
                error: "Missing required fields: wallpaperId, roomType, style, mood",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── 4. Fetch wallpaper ──────────────────────────────────────────────
          const { data: wallpaper, error: wallpaperError } = await supabase
            .from("wallpapers")
            .select("*")
            .eq("id", wallpaperId)
            .single();

          if (wallpaperError || !wallpaper) {
            return new Response(JSON.stringify({ error: "Wallpaper not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (wallpaper.company_id !== companyId) {
            return new Response(JSON.stringify({ error: "Wallpaper not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!process.env.XAI_API_KEY) {
            return new Response(
              JSON.stringify({ error: "AI generation service is temporarily unavailable." }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── 5. Generate requested variations in parallel ───────────────────
          console.log(
            `[Generate Room] Generating ${variationCount} variations for wallpaper ${wallpaperId}`,
            { roomType, style, mood, variationCount },
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
              if (!downloadRes.ok)
                throw new Error(`Failed to download variation ${variationIndex + 1}`);
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

              console.log(
                `[Generate Room] Variation ${variationIndex + 1} stored: ${publicUrlData.publicUrl}`,
              );
              return publicUrlData.publicUrl;
            } catch (err: unknown) {
              console.error(
                `[Generate Room] Variation ${variationIndex + 1} failed:`,
                getErrorMessage(err),
              );
              throw err;
            }
          };

          // Run requested count in parallel
          let variationUrls: string[];
          try {
            variationUrls = await Promise.all(
              Array.from({ length: variationCount }, (_, index) => index).map(generateOne),
            );
          } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            console.error("[Generate Room] One or more variations failed:", errorMessage);
            return new Response(
              JSON.stringify({
                error: "AI generation failed. Please try again.",
                details: errorMessage,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── 6. Insert record into ai_generations ────────────────────────────
          console.log("[Generate Room] Inserting ai_generations record...");

          let generationId: string | null = null;
          const aiGenerationsClient = supabase as unknown as AiGenerationsInsertClient;
          try {
            const { data: gen, error: insertError } = await aiGenerationsClient
              .from("ai_generations")
              .insert({
                company_id: companyId,
                user_id: user.id,
                wallpaper_id: wallpaperId,
                room_type: roomType,
                style,
                mood,
                custom_prompt: customPrompt || null,
                status: "completed",
                variation_1_url: variationUrls[0] || null,
                variation_2_url: variationUrls[1] || null,
                variation_3_url: variationUrls[2] || null,
                variation_4_url: variationUrls[3] || null,
              })
              .select("id")
              .single();

            if (!insertError && gen) {
              generationId = gen.id;
            } else {
              console.warn("[Generate Room] DB insert warning:", insertError?.message);
            }
          } catch (dbErr: unknown) {
            // Non-fatal — we still return the URLs even if DB insert fails
            console.warn("[Generate Room] DB insert failed (non-fatal):", getErrorMessage(dbErr));
          }

          // ── 7. Insert one visualization record per generated image ─────────
          const visualizationRows = variationUrls.map((url) => ({
            company_id: companyId,
            user_id: user.id,
            wallpaper_id: wallpaperId,
            mockup_room_id: null,
            source_type: "ai_generated",
            result_image_url: url,
            room_type: roomType,
            style,
            mood,
            custom_prompt: customPrompt || null,
          }));

          const visualizationsClient = supabase as unknown as VisualizationsInsertClient;
          const insertVisualizations = async (
            rows: Record<string, unknown>[],
            includeMetadata = true,
          ) =>
            visualizationsClient
              .from("visualizations")
              .insert(rows)
              .select(
                includeMetadata
                  ? "id,result_image_url,room_type,style,mood,created_at"
                  : "id,result_image_url,room_type,created_at",
              );

          let visualizationRecords: Array<{
            id: string;
            result_image_url: string;
            room_type?: string | null;
            style?: string | null;
            mood?: string | null;
            created_at?: string | null;
          }> | null = null;

          try {
            let { data, error } = await insertVisualizations(visualizationRows);

            if (error) {
              console.warn(
                "[Generate Room] Visualization insert with metadata failed, retrying:",
                error.message,
              );
              const rowsWithoutOptionalColumns = visualizationRows.map(
                ({ style: _style, mood: _mood, custom_prompt: _customPrompt, ...row }) => row,
              );
              ({ data, error } = await insertVisualizations(rowsWithoutOptionalColumns, false));
            }

            if (error) {
              console.warn(
                "[Generate Room] Visualization insert with user_id failed, retrying:",
                error.message,
              );
              const rowsWithoutUserId = visualizationRows.map(
                ({
                  style: _style,
                  mood: _mood,
                  custom_prompt: _customPrompt,
                  user_id: _userId,
                  ...row
                }) => row,
              );
              ({ data, error } = await insertVisualizations(rowsWithoutUserId, false));
            }

            if (error) {
              console.warn("[Generate Room] Visualization insert failed:", error.message);
            } else {
              visualizationRecords = data || [];
            }
          } catch (vizErr: unknown) {
            console.warn(
              "[Generate Room] Visualization insert failed (non-fatal):",
              getErrorMessage(vizErr),
            );
          }

          console.log(`[Generate Room] Complete. Returning ${variationCount} variation URLs.`);
          return new Response(
            JSON.stringify({
              id: generationId,
              wallpaper_id: wallpaperId,
              room_type: roomType,
              style,
              mood,
              variationCount,
              variation_1_url: variationUrls[0] || null,
              variation_2_url: variationUrls[1] || null,
              variation_3_url: variationUrls[2] || null,
              variation_4_url: variationUrls[3] || null,
              visualizations: visualizationRecords || [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (globalError: unknown) {
          const errorMessage = getErrorMessage(globalError);
          console.error("[Generate Room] Unhandled error:", globalError);
          return new Response(
            JSON.stringify({
              error: "Unable to generate room design. Please try again.",
              details: errorMessage,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
