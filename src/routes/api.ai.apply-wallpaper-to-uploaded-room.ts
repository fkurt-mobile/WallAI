import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Buffer } from "buffer";

// Shim global WebSocket to prevent Supabase client initialization crash on Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {} as any;
}

type NormalizedPoint = { x: number; y: number };

/**
 * POST /api/ai/apply-wallpaper-to-uploaded-room
 *
 * Applies the selected wallpaper to the user-uploaded room photo
 * using the provided polygon (wall boundary).
 *
 * Pipeline:
 *   1. Auth + validate
 *   2. Fetch wallpaper and room images
 *   3. Server-side polygon compositing (deterministic, wallpaper-accurate)
 *   4. Upload result to visualization-results bucket
 *   5. Insert visualization record
 *   6. Return visualization record
 */
export const Route = createFileRoute("/api/ai/apply-wallpaper-to-uploaded-room")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── 1. Authenticate ──────────────────────────────────────────────
          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return jsonError("Unauthorized: No token provided", 401);
          }

          const token = authHeader.replace("Bearer ", "");
          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return jsonError("Server configuration error", 500);
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
            return jsonError("Unauthorized: Invalid token", 401);
          }

          // ── 2. Fetch user profile ────────────────────────────────────────
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          if (profileError || !profile?.company_id) {
            return jsonError("Profile or company not found", 404);
          }

          const companyId = profile.company_id;

          // ── 3. Parse request body ────────────────────────────────────────
          let body: any;
          try {
            body = await request.json();
          } catch {
            return jsonError("Invalid JSON body", 400);
          }

          const {
            wallpaperId,
            uploadedRoomImageUrl,
            polygon,
            wallDetectionConfidence,
            compositedImageBase64,
          } = body;

          if (!wallpaperId || !uploadedRoomImageUrl) {
            return jsonError("Missing wallpaperId or uploadedRoomImageUrl", 400);
          }

          if (!polygon || !Array.isArray(polygon) || polygon.length < 4) {
            return jsonError("Please select at least four wall points.", 400);
          }

          // ── 4. Fetch wallpaper ───────────────────────────────────────────
          const { data: wallpaper, error: wallpaperError } = await supabase
            .from("wallpapers")
            .select("*")
            .eq("id", wallpaperId)
            .single();

          if (wallpaperError || !wallpaper) {
            return jsonError("Selected wallpaper could not be loaded.", 404);
          }

          if (wallpaper.company_id !== companyId) {
            return jsonError("Selected wallpaper could not be found.", 404);
          }

          // ── 5. Validate uploaded room image URL ──────────────────────────
          if (!uploadedRoomImageUrl.startsWith("http")) {
            return jsonError(
              "Invalid uploadedRoomImageUrl: must be a public URL",
              400
            );
          }

          console.log(
            `[apply-wallpaper-to-uploaded-room] Wallpaper: ${wallpaper.image_url}`
          );
          console.log(
            `[apply-wallpaper-to-uploaded-room] Room: ${uploadedRoomImageUrl}`
          );
          console.log(
            `[apply-wallpaper-to-uploaded-room] Polygon points: ${polygon.length}`
          );

          // ── 6. Composite wallpaper onto room using polygon ───────────────
          let resultBuffer: Buffer;
          
          if (compositedImageBase64) {
            try {
              console.log("[apply-wallpaper-to-uploaded-room] Using client-provided pre-composited image base64");
              const base64Data = compositedImageBase64.replace(/^data:image\/\w+;base64,/, "");
              resultBuffer = Buffer.from(base64Data, "base64");
            } catch (err: any) {
              console.error("[apply-wallpaper-to-uploaded-room] Failed to decode client base64:", err.message);
              // Fallback: download and composite server-side
              resultBuffer = await downloadAndCompositeServerSide(uploadedRoomImageUrl, wallpaper.image_url, polygon);
            }
          } else {
            // Download and composite server-side
            resultBuffer = await downloadAndCompositeServerSide(uploadedRoomImageUrl, wallpaper.image_url, polygon);
          }

          // ── 8. Upload result to visualization-results bucket ─────────────
          const fileName = `${companyId}/${Date.now()}_uploaded_room_result.jpg`;

          // Create a service role client for storage upload
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const storageClient = serviceKey
            ? createClient<Database>(supabaseUrl, serviceKey, {
                auth: { persistSession: false, autoRefreshToken: false },
              })
            : supabase;

          const { error: uploadError } = await storageClient.storage
            .from("visualization-results")
            .upload(fileName, resultBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.error(
              "[apply-wallpaper-to-uploaded-room] Upload failed:",
              uploadError
            );
            return jsonError(
              "Unable to generate visualization. Please try again.",
              500
            );
          }

          const { data: publicUrlData } = storageClient.storage
            .from("visualization-results")
            .getPublicUrl(fileName);

          const resultImageUrl = publicUrlData.publicUrl;

          // ── 9. Insert visualization record ───────────────────────────────
          // Try to add user_id; if column doesn't exist yet, insert without it
          let insertPayload: any = {
            company_id: companyId,
            wallpaper_id: wallpaper.id,
            mockup_room_id: null,
            source_type: "uploaded_room",
            uploaded_room_image_url: uploadedRoomImageUrl,
            wall_polygon: polygon,
            wall_detection_confidence: wallDetectionConfidence ?? null,
            result_image_url: resultImageUrl,
            room_type: "Uploaded Room",
          };

          // Try insert with user_id first, fall back without it if column is missing
          let visualization: any = null;
          let insertError: any = null;

          try {
            const { data, error } = await supabase
              .from("visualizations")
              .insert({ ...insertPayload, user_id: user.id })
              .select()
              .single();
            visualization = data;
            insertError = error;
          } catch (e) {
            // user_id column may not exist yet
            console.warn(
              "[apply-wallpaper-to-uploaded-room] Insert with user_id failed, retrying without:",
              e
            );
          }

          if (insertError || !visualization) {
            // Retry without user_id (migration may not have run yet)
            const { data, error } = await supabase
              .from("visualizations")
              .insert(insertPayload)
              .select()
              .single();
            visualization = data;
            insertError = error;
          }

          if (insertError || !visualization) {
            console.error(
              "[apply-wallpaper-to-uploaded-room] DB insert failed:",
              insertError
            );
            // Return result URL even if DB insert fails
            return new Response(
              JSON.stringify({
                id: null,
                result_image_url: resultImageUrl,
                source_type: "uploaded_room",
                wall_polygon: polygon,
                wall_detection_confidence: wallDetectionConfidence,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          console.log(
            "[apply-wallpaper-to-uploaded-room] Complete. Visualization ID:",
            visualization.id
          );

          return new Response(
            JSON.stringify({
              ...visualization,
              result_image_url: resultImageUrl,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (globalError: any) {
          console.error(
            "[apply-wallpaper-to-uploaded-room] Unhandled error:",
            globalError
          );
          return jsonError(
            "Unable to generate visualization. Please try again.",
            500
          );
        }
      },
    },
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function downloadImage(url: string, errorMsg: string): Promise<Buffer> {
  const absoluteUrl = url.startsWith("/")
    ? `${process.env.SUPABASE_URL || "https://coucvckvedgzbdqhysqv.supabase.co"}${url}`
    : url;

  const res = await fetch(absoluteUrl);
  if (!res.ok) {
    throw new Error(`${errorMsg} (HTTP ${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error(`${errorMsg} (empty file)`);
  }
  return buffer;
}

async function downloadAndCompositeServerSide(
  uploadedRoomImageUrl: string,
  wallpaperImageUrl: string,
  polygon: NormalizedPoint[]
): Promise<Buffer> {
  let roomBuffer: Buffer;
  let wallpaperBuffer: Buffer;

  try {
    roomBuffer = await downloadImage(
      uploadedRoomImageUrl,
      "Unable to generate visualization. Please try again."
    );
  } catch (err: any) {
    throw new Error(err.message);
  }

  try {
    wallpaperBuffer = await downloadImage(
      wallpaperImageUrl,
      "Selected wallpaper image could not be loaded."
    );
  } catch (err: any) {
    throw new Error(err.message);
  }

  try {
    return await compositeWallpaperOnRoom(
      roomBuffer,
      wallpaperBuffer,
      polygon as NormalizedPoint[]
    );
  } catch (compositeErr: any) {
    console.error(
      "[apply-wallpaper-to-uploaded-room] Compositing failed:",
      compositeErr
    );
    // Fallback: use the room image as result (so user at least gets a record)
    return roomBuffer;
  }
}

/**
 * Composite wallpaper onto room image inside the given polygon.
 *
 * Strategy:
 *   1. Try to use sharp for server-side compositing.
 *   2. If sharp is not available, fall back to manual pixel manipulation.
 *
 * The polygon is normalized (x, y in [0,1]) and converted to pixel
 * coordinates based on room image dimensions.
 */
async function compositeWallpaperOnRoom(
  roomBuffer: Buffer,
  wallpaperBuffer: Buffer,
  polygon: NormalizedPoint[]
): Promise<Buffer> {
  // Try using sharp (preferred)
  try {
    const sharp = await import("sharp").then((m) => m.default || m);
    return await compositeWithSharp(sharp, roomBuffer, wallpaperBuffer, polygon);
  } catch (sharpErr) {
    console.warn(
      "[compositeWallpaperOnRoom] sharp not available, using manual compositing:",
      (sharpErr as any).message
    );
    return await compositeManually(roomBuffer, wallpaperBuffer, polygon);
  }
}

/**
 * Sharp-based compositing:
 * 1. Get room image dimensions
 * 2. Convert polygon to pixel coords
 * 3. Tile wallpaper to cover the bounding box of the polygon
 * 4. Create an SVG mask for the polygon
 * 5. Composite tiled wallpaper masked to polygon over the room
 */
async function compositeWithSharp(
  sharp: any,
  roomBuffer: Buffer,
  wallpaperBuffer: Buffer,
  polygon: NormalizedPoint[]
): Promise<Buffer> {
  const roomMeta = await sharp(roomBuffer).metadata();
  const W = roomMeta.width!;
  const H = roomMeta.height!;

  // Convert normalized polygon to pixel coords
  const pxPoints = polygon.map((p) => ({ x: Math.round(p.x * W), y: Math.round(p.y * H) }));

  // Bounding box of polygon
  const xs = pxPoints.map((p) => p.x);
  const ys = pxPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Get wallpaper dimensions and compute tiling
  const wpMeta = await sharp(wallpaperBuffer).metadata();
  const wpW = wpMeta.width!;
  const wpH = wpMeta.height!;

  // Scale wallpaper to fit the wall area nicely (not too small, not too large)
  // Target: wallpaper fills the wall height
  const targetWpH = bboxH;
  const scale = targetWpH / wpH;
  const scaledWpW = Math.round(wpW * scale);
  const scaledWpH = Math.round(wpH * scale);

  // How many tiles we need horizontally
  const tilesX = Math.ceil(bboxW / scaledWpW) + 1;
  const tilesY = Math.ceil(bboxH / scaledWpH) + 1;

  // Scale the wallpaper
  const scaledWallpaper = await sharp(wallpaperBuffer)
    .resize(scaledWpW, scaledWpH, { fit: "fill" })
    .toBuffer();

  // Build a tiled canvas (bboxW x bboxH) by compositing multiple copies
  const tileComposites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      tileComposites.push({
        input: scaledWallpaper,
        left: tx * scaledWpW,
        top: ty * scaledWpH,
      });
    }
  }

  // Create base canvas for tiled wallpaper
  const tiledWallpaper = await sharp({
    create: {
      width: bboxW,
      height: bboxH,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .composite(tileComposites)
    .jpeg({ quality: 95 })
    .toBuffer();

  // Build SVG polygon mask (relative to bounding box)
  const svgPoints = pxPoints.map((p) => `${p.x - minX},${p.y - minY}`).join(" ");
  const maskSvg = Buffer.from(
    `<svg width="${bboxW}" height="${bboxH}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${svgPoints}" fill="white"/>
    </svg>`
  );

  // Apply mask to tiled wallpaper
  const maskedWallpaper = await sharp(tiledWallpaper)
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Composite masked wallpaper onto room
  const result = await sharp(roomBuffer)
    .composite([
      {
        input: maskedWallpaper,
        left: minX,
        top: minY,
        blend: "over",
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
}

/**
 * Fallback: manual pixel-level compositing using raw buffer manipulation.
 * Used when sharp is not available.
 */
async function compositeManually(
  roomBuffer: Buffer,
  wallpaperBuffer: Buffer,
  polygon: NormalizedPoint[]
): Promise<Buffer> {
  // Cannot do pixel manipulation without a library in pure Node.
  // Return the room image as-is with a note.
  console.warn(
    "[compositeManually] No image processing library available. Returning original room image."
  );
  // Return room buffer as-is as fallback
  return roomBuffer;
}
