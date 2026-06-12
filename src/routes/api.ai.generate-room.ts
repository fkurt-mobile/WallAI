import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRoomDesign } from "@/services/grokService";
import { Buffer } from "buffer";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as unknown as typeof WebSocket;
}

type GenerateRoomRequestBody = {
  wallpaperId?: string;
  roomType?: string;
  style?: string;
  mood?: string;
  customPrompt?: string;
  variationCount?: number;
  referenceGenerationId?: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
          let body: GenerateRoomRequestBody;
          try {
            body = await request.json();
          } catch (parseError) {
            void parseError;
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const {
            wallpaperId,
            roomType,
            style,
            mood,
            customPrompt,
            variationCount: requestedVariationCount,
            referenceGenerationId,
          } = body;

          if (!wallpaperId || !roomType || !style || !mood) {
            return new Response(
              JSON.stringify({
                error: "Missing required fields: wallpaperId, roomType, style, mood",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const parsedVariationCount = Number(requestedVariationCount);
          const variationCount = Number.isFinite(parsedVariationCount)
            ? Math.max(1, Math.min(4, Math.trunc(parsedVariationCount)))
            : 2;

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

          // ── 5. Create generation record up front so visualizations can link to it ─
          const generationInsert: Database["public"]["Tables"]["ai_generations"]["Insert"] = {
            company_id: companyId,
            user_id: user.id,
            wallpaper_id: wallpaperId,
            room_type: roomType,
            style,
            mood,
            custom_prompt: customPrompt || null,
            variation_count: variationCount,
            status: "pending",
          };

          if (referenceGenerationId) {
            generationInsert.reference_generation_id = referenceGenerationId;
          }

          const { data: generationRow, error: generationInsertError } = await supabase
            .from("ai_generations")
            .insert(generationInsert)
            .select("id")
            .single();

          if (generationInsertError || !generationRow) {
            console.error(
              "[Generate Room] Failed to create ai_generations row:",
              generationInsertError,
            );
            return new Response(
              JSON.stringify({
                error: "Unable to save generation. Please try again.",
                details: generationInsertError?.message || "Unknown database error",
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          const generationId = generationRow.id;

          // ── 6. Generate the requested number of variations in parallel ─────
          console.log(
            `[Generate Room] Generating ${variationCount} variations for wallpaper ${wallpaperId}`,
            { roomType, style, mood, referenceGenerationId },
          );

          const generationContextPrompt = [
            customPrompt?.trim() ? `User instructions:\n${customPrompt.trim()}` : null,
            referenceGenerationId
              ? [
                  "Create a new design variation inspired by the previous generation.",
                  "Keep the wallpaper, room type, style, and mood the same.",
                  "Change the furniture arrangement, architecture details, lighting composition, and camera angle.",
                  "Do not duplicate previous outputs.",
                ].join(" ")
              : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          const generateOne = async (variationIndex: number): Promise<string> => {
            console.log(`[Generate Room] Starting variation ${variationIndex + 1}...`);
            try {
              const imageUrl = await generateRoomDesign({
                wallpaperImageUrl: wallpaper.image_url,
                roomType,
                style,
                mood,
                customPrompt: [
                  generationContextPrompt,
                  `Create variation ${variationIndex + 1} of ${variationCount}.`,
                  "Make the composition distinct from the other variations while preserving the wallpaper exactly.",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
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
            } catch (error: unknown) {
              const message = getErrorMessage(error);
              console.error(`[Generate Room] Variation ${variationIndex + 1} failed:`, message);
              throw error;
            }
          };

          // Run only the requested number of variations in parallel.
          let variationUrls: string[];
          try {
            variationUrls = await Promise.all(
              Array.from({ length: variationCount }, (_, index) => generateOne(index)),
            );
          } catch (error: unknown) {
            const message = getErrorMessage(error);
            console.error("[Generate Room] One or more variations failed:", message);
            await supabase
              .from("ai_generations")
              .update({ status: "failed" })
              .eq("id", generationId);
            return new Response(
              JSON.stringify({
                error: "AI generation failed. Please try again.",
                details: message,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          const [variation_1_url, variation_2_url, variation_3_url, variation_4_url] = [
            variationUrls[0] || null,
            variationUrls[1] || null,
            variationUrls[2] || null,
            variationUrls[3] || null,
          ];

          const updateGenerationResult = await supabase
            .from("ai_generations")
            .update({
              status: "completed",
              variation_count: variationCount,
              variation_1_url,
              variation_2_url,
              variation_3_url,
              variation_4_url,
            })
            .eq("id", generationId);

          if (updateGenerationResult.error) {
            console.warn(
              "[Generate Room] Failed to update ai_generations row:",
              updateGenerationResult.error.message,
            );
          }

          const visualizationRecords = variationUrls.map(async (previewImageUrl, index) => {
            const { data: visualization, error: visualizationInsertError } = await supabase
              .from("visualizations")
              .insert({
                company_id: companyId,
                user_id: user.id,
                wallpaper_id: wallpaperId,
                generation_id: generationId,
                source_type: "ai_generated",
                result_image_url: previewImageUrl,
                preview_image_url: previewImageUrl,
                room_type: roomType,
                style,
                mood,
              })
              .select(
                "id, company_id, user_id, wallpaper_id, generation_id, room_type, style, mood, preview_image_url, result_image_url, created_at",
              )
              .single();

            if (visualizationInsertError || !visualization) {
              throw new Error(
                `Visualization insert failed for variation ${index + 1}: ${visualizationInsertError?.message || "Unknown error"}`,
              );
            }

            return visualization;
          });

          let visualizations;
          try {
            visualizations = await Promise.all(visualizationRecords);
          } catch (error: unknown) {
            const message = getErrorMessage(error);
            await supabase
              .from("ai_generations")
              .update({ status: "failed" })
              .eq("id", generationId);
            console.error("[Generate Room] Visualization record insert failed:", message);
            return new Response(
              JSON.stringify({
                error: "Generated images were created, but could not be saved. Please try again.",
                details: message,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
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
              variation_count: variationCount,
              variation_1_url,
              variation_2_url,
              variation_3_url,
              variation_4_url,
              visualizations,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error: unknown) {
          const message = getErrorMessage(error);
          console.error("[Generate Room] Unhandled error:", message);
          return new Response(
            JSON.stringify({
              error: "Unable to generate room design. Please try again.",
              details: message,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
