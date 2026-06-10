import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateWallpaperMockup } from "@/services/grokService";
import { Buffer } from "buffer";
import fs from "fs";
import path from "path";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as any;
}

export const Route = createFileRoute("/api/ai/apply-wallpaper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Authenticate user from the Authorization header
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.error("[API Apply Wallpaper] Unauthorized: No bearer token provided");
            return new Response(
              JSON.stringify({ error: "Unauthorized: No token provided" }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const token = authHeader.replace("Bearer ", "");

          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            console.error("[API Apply Wallpaper] Missing Supabase environment variables");
            return new Response(
              JSON.stringify({ error: "Server configuration error" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // Create a user-scoped Supabase client using the Bearer token.
          // This ensures RLS rules are respected.
          const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });

          // Verify the token by getting the user info
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();

          if (authError || !user) {
            console.error("[API Apply Wallpaper] Unauthorized: Invalid token", authError);
            return new Response(
              JSON.stringify({ error: "Unauthorized: Invalid token" }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // 2. Fetch user profile and company_id
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          if (profileError || !profile) {
            console.error("[API Apply Wallpaper] Profile not found", profileError);
            return new Response(
              JSON.stringify({ error: "Profile not found" }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const companyId = profile.company_id;
          if (!companyId) {
            console.error("[API Apply Wallpaper] Profile has no associated company");
            return new Response(
              JSON.stringify({ error: "User profile has no associated company" }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // Read request body
          let body: any;
          try {
            body = await request.json();
          } catch (e) {
            return new Response(
              JSON.stringify({ error: "Invalid JSON body" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const { wallpaperId, mockupRoomId, compositedImageBase64 } = body;
          if (!wallpaperId || !mockupRoomId) {
            return new Response(
              JSON.stringify({ error: "Missing wallpaperId or mockupRoomId" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // 3. Fetch wallpaper from wallpapers table
          const { data: wallpaper, error: wallpaperError } = await supabase
            .from("wallpapers")
            .select("*")
            .eq("id", wallpaperId)
            .single();

          // 4. Fetch mockup room from mockup_rooms table
          const { data: mockupRoom, error: mockupRoomError } = await supabase
            .from("mockup_rooms")
            .select("*")
            .eq("id", mockupRoomId)
            .single();

          // Helper to check image accessibility and download it
          const validateAndDownloadImage = async (url: string, errorMsg: string): Promise<Buffer> => {
            const absoluteUrl = url.startsWith("/")
              ? `${process.env.SUPABASE_URL || "https://coucvckvedgzbdqhysqv.supabase.co"}${url}`
              : url;
            try {
              const res = await fetch(absoluteUrl);
              if (!res.ok) {
                throw new Error(`Bad response status: ${res.status}`);
              }
              const arrayBuffer = await res.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              if (buffer.length === 0) {
                throw new Error("Empty image file downloaded");
              }
              return buffer;
            } catch (err) {
              console.error(`[API Apply Wallpaper] Image validation failed for URL ${absoluteUrl}:`, err);
              throw new Error(errorMsg);
            }
          };

          // 5. Validate both exist
          if (wallpaperError || !wallpaper) {
            console.error("[API Apply Wallpaper] Wallpaper not found", wallpaperError);
            return new Response(
              JSON.stringify({ error: "Selected wallpaper image could not be loaded." }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          if (mockupRoomError || !mockupRoom) {
            console.error("[API Apply Wallpaper] Mockup room not found", mockupRoomError);
            return new Response(
              JSON.stringify({ error: "Selected room mockup could not be loaded." }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // Validate and download both reference images server-side
          let wallpaperBuffer: Buffer;
          let mockupBuffer: Buffer;
          try {
            wallpaperBuffer = await validateAndDownloadImage(
              wallpaper.image_url,
              "Selected wallpaper image could not be loaded."
            );
          } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          try {
            mockupBuffer = await validateAndDownloadImage(
              mockupRoom.image_url,
              "Selected room mockup could not be loaded."
            );
          } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const isDebug = process.env.AI_DEBUG === "true" || process.env.VITE_AI_DEBUG === "true";
          if (isDebug) {
            try {
              const debugDir = path.join(process.cwd(), "public", "debug_uploads");
              if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
              }
              fs.writeFileSync(path.join(debugDir, "debug_wallpaper.jpg"), wallpaperBuffer);
              fs.writeFileSync(path.join(debugDir, "debug_mockup.jpg"), mockupBuffer);
              console.log(`[API Apply Wallpaper] [DEBUG] Saved debug thumbnails to ${debugDir}`);
            } catch (debugWriteErr) {
              console.warn("[API Apply Wallpaper] [DEBUG] Failed to write debug thumbnails:", debugWriteErr);
            }
          }

          // 6. Validate wallpaper belongs to current company
          if (wallpaper.company_id !== companyId) {
            console.error(
              `[API Apply Wallpaper] Security violation: company ${companyId} tried to access wallpaper owned by ${wallpaper.company_id}`
            );
            return new Response(
              JSON.stringify({ error: "Selected wallpaper or mockup could not be found." }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          let imageBuffer: Buffer;

          // Check for API key first
          if (!process.env.XAI_API_KEY) {
            console.error("[API Apply Wallpaper] Missing XAI_API_KEY");
            return new Response(
              JSON.stringify({ 
                error: "AI generation service is temporarily unavailable.",
                details: "Missing XAI_API_KEY in server environment variables."
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // Call Grok image generation API
          console.log(`[API Apply Wallpaper] Requesting AI visualization. Wallpaper ID: ${wallpaperId}, Mockup ID: ${mockupRoomId}`);
          console.log(`[API Apply Wallpaper] Images: wallpaper=${wallpaper.image_url}, mockup=${mockupRoom.image_url}`);

          let generatedImageUrl: string;
          try {
            generatedImageUrl = await generateWallpaperMockup({
              wallpaperImageUrl: wallpaper.image_url,
              mockupImageUrl: mockupRoom.image_url,
              customPrompt: body.customPrompt,
            });
          } catch (apiError: any) {
            console.error("[API Apply Wallpaper] Grok API Call failed:", apiError);
            return new Response(
              JSON.stringify({ 
                error: "AI generation service is temporarily unavailable.",
                details: `Grok call failed: ${apiError.message}`
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // Download generated image URL
          console.log(`[API Apply Wallpaper] Downloading generated image from: ${generatedImageUrl}`);
          try {
            const downloadResponse = await fetch(generatedImageUrl);
            if (!downloadResponse.ok) {
              throw new Error(`Failed to fetch generated image: ${downloadResponse.statusText}`);
            }
            const arrayBuffer = await downloadResponse.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
          } catch (downloadError: any) {
            console.error("[API Apply Wallpaper] Failed to download generated image:", downloadError);
            return new Response(
              JSON.stringify({
                error: "Unable to generate visualization. Please try again.",
                details: `Download failed: ${downloadError.message}`,
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // 9. Upload final result to Supabase Storage bucket: visualization-results
          const fileName = `${companyId}/${Date.now()}_visualization.jpg`;
          console.log(`[API Apply Wallpaper] Uploading result to storage: ${fileName}`);
          const { error: uploadError } = await supabase.storage
            .from("visualization-results")
            .upload(fileName, imageBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.error("[API Apply Wallpaper] Supabase Storage upload failed:", uploadError);
            return new Response(
              JSON.stringify({
                error: "Unable to generate visualization. Please try again.",
                details: `Storage upload failed: ${uploadError.message}`,
              }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const { data: publicUrlData } = supabase.storage
            .from("visualization-results")
            .getPublicUrl(fileName);
          const resultImageUrl = publicUrlData.publicUrl;

          // 10. Insert record into visualizations table
          console.log("[API Apply Wallpaper] Inserting visualization record into database...");
          const { data: visualization, error: insertError } = await supabase
            .from("visualizations")
            .insert({
              company_id: companyId,
              user_id: user.id,
              wallpaper_id: wallpaper.id,
              mockup_room_id: mockupRoom.id,
              source_type: "ready_mockup",
              result_image_url: resultImageUrl,
              room_type: mockupRoom.category || "Room",
            })
            .select()
            .single();

          if (insertError || !visualization) {
            console.error("[API Apply Wallpaper] Database insert failed:", insertError);
            return new Response(
              JSON.stringify({
                error: "Unable to generate visualization. Please try again.",
                details: `Database insert failed: ${insertError?.message || "Unknown DB error"}`,
              }),


              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // 11. Return visualization record
          console.log("[API Apply Wallpaper] Visualization process complete. Returning record ID:", visualization.id);
          
          const debugData = isDebug ? {
            wallpaper_url: wallpaper.image_url,
            mockup_url: mockupRoom.image_url,
            payload_type: "grok_composite",
            input_type: "url_list",
            model_used: "grok-imagine-image",
            prompt_version: "wallmock_ai_v1"
          } : null;
          return new Response(JSON.stringify({
            ...visualization,
            ...(debugData ? { debug: debugData } : {})
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (globalError: any) {
          console.error("[API Apply Wallpaper] Unhandled API error:", globalError);
          return new Response(
            JSON.stringify({
              error: "Unable to generate visualization. Please try again.",
              details: `Unhandled error: ${globalError.message}`,
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
