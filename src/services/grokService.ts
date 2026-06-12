// ─────────────────────────────────────────────────────────────────────────────
// grokService.ts — xAI Imagine integration for AI Room Designer
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateMockupParams {
  wallpaperImageUrl: string;
  mockupImageUrl: string;
  customPrompt?: string;
}

interface GenerateRoomDesignParams {
  wallpaperImageUrl: string;
  roomType: string;
  style: string;
  mood: string;
  customPrompt?: string;
}

const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";

const toImageRef = (url: string) => ({
  type: "image_url",
  url,
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy: single wallpaper-on-mockup generation (kept for old API routes)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateWallpaperMockup({
  wallpaperImageUrl,
  mockupImageUrl,
  customPrompt,
}: GenerateMockupParams): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("[Grok Service] Missing XAI_API_KEY environment variable");
    throw new Error("Missing XAI_API_KEY");
  }

  const makeAbsolute = (url: string) => {
    if (url.startsWith("/")) {
      const base = process.env.SUPABASE_URL || "https://coucvckvedgzbdqhysqv.supabase.co";
      return `${base}${url}`;
    }
    return url;
  };

  const absoluteWallpaperUrl = makeAbsolute(wallpaperImageUrl);
  const absoluteMockupUrl = makeAbsolute(mockupImageUrl);

  const systemPrompt = `You are WallMock AI — a highly precise image compositing specialist focused exclusively on applying wallpapers to interior walls in mockup photos.

Your ONLY job is to follow this exact workflow:

1. Receive two images:
   - Image A → The Mockup Image (a photo of a room that contains at least one visible wall).
   - Image B → The Wallpaper (the pattern/texture/design the user wants to apply). This image must be placed exactly as-is (no color changes, no style changes, no filtering, no regeneration).

2. Analyze Image A:
   - Detect the main wall(s) in the mockup image.
   - Understand perspective, lighting, angle, and surface texture of the wall.

3. Composite Precisely:
   - Place the Wallpaper (Image B) onto the detected wall in Image A.
   - Strict Rules:
     - Preserve the wallpaper 100% unchanged — exact colors, pattern, resolution, and details.
     - Only modify the wall area in the mockup image.
     - Apply realistic perspective distortion to match the wall's angle.
     - Blend naturally with existing lighting, shadows, and room ambiance.
     - Add subtle realistic effects: soft shadows on edges, slight surface texture interaction, and proper perspective.
     - Do not change furniture, windows, floors, or any other part of the room.
     - Keep the final image high resolution and photorealistic.

Output Requirements:
- Always generate one clean final image.
- Briefly describe what you did (1-2 sentences) before showing the result.
- If the wall is not clear, ask for clarification instead of guessing.

Tone: Professional, precise, and fast.

Never:
- Change or regenerate the wallpaper image.
- Apply artistic styles.
- Add extra objects or people.

Now process the two uploaded images according to the user's instructions.`;

  const basePrompt = `Apply the exact wallpaper from the second image onto the main wall in the first image.
Keep the wallpaper 100% unchanged in colors, pattern, and quality.
Match perspective, lighting, and add realistic blending and shadows only on the wall area.
Do not change any other part of the room.`;

  const fullPrompt = `${systemPrompt}\n\n${basePrompt}${customPrompt ? `\n\nAdditional instructions: ${customPrompt}` : ""}`;

  console.log(`[Grok Service] Calling ${XAI_IMAGE_MODEL} with wallpaper and mockup URLs...`);
  console.log(`[Grok Service] Wallpaper URL: ${absoluteWallpaperUrl}`);
  console.log(`[Grok Service] Mockup URL: ${absoluteMockupUrl}`);

  try {
    const response = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: XAI_IMAGE_MODEL,
        prompt: fullPrompt,
        images: [toImageRef(absoluteMockupUrl), toImageRef(absoluteWallpaperUrl)],
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Grok Service] API call failed: ${response.status} - ${errorText}`);
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Grok Service] Grok response status: ${response.status}`);

    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error("Invalid response format from Grok API");
    }

    console.log("[Grok Service] Successfully generated visualization via grok-imagine-image");
    return imageUrl;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Grok Service] Generation failed:", message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: AI Room Designer — single-step generation with Grok Imagine
//
// Uses POST /v1/images/edits with the wallpaper image as a reference.
// The Grok Imagine model sees the exact wallpaper pattern and generates a complete
// photorealistic room featuring it on the wall — in one API call.
// Model: "grok-imagine-image-quality" by default, or override with XAI_IMAGE_MODEL.
//
// Returns a single generated image URL.
// The API route decides how many parallel calls to make.
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRoomDesign({
  wallpaperImageUrl,
  roomType,
  style,
  mood,
  customPrompt,
}: GenerateRoomDesignParams): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("[Room Design] Missing XAI_API_KEY environment variable");
    throw new Error("Missing XAI_API_KEY");
  }

  const makeAbsolute = (url: string) => {
    if (url.startsWith("/")) {
      const base = process.env.SUPABASE_URL || "https://coucvckvedgzbdqhysqv.supabase.co";
      return `${base}${url}`;
    }
    return url;
  };

  const absoluteWallpaperUrl = makeAbsolute(wallpaperImageUrl);

  const editPrompt = `Create a professional photorealistic interior design visualization for a ${roomType}.

DESIGN STYLE: ${style}
ATMOSPHERE: ${mood}
${customPrompt ? `ADDITIONAL DETAILS: ${customPrompt}` : ""}

WALLPAPER INSTRUCTIONS:
- The reference image provided IS the wallpaper to use on the main wall.
- Preserve the EXACT colors, pattern, texture, and artwork from the reference — do not alter or reinterpret it.
- Feature the wallpaper prominently on the main feature wall.
- Apply it with realistic perspective and natural lighting.

ROOM REQUIREMENTS:
- Generate a complete photorealistic ${roomType} interior around the wallpaper.
- Premium furniture matching ${style} aesthetic.
- ${mood} lighting and atmosphere.
- Professional interior photography framing, no people.
- Architectural quality, high resolution rendering.`;

  console.log(`[Room Design] Calling ${XAI_IMAGE_MODEL} (${roomType}, ${style}, ${mood})...`);

  const response = await fetch("https://api.x.ai/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: XAI_IMAGE_MODEL,
      prompt: editPrompt,
      image: toImageRef(absoluteWallpaperUrl),
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Room Design] ${XAI_IMAGE_MODEL} failed: ${response.status} - ${errorText}`);
    throw new Error(`${XAI_IMAGE_MODEL} API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const finalImageUrl = data.data?.[0]?.url;
  if (!finalImageUrl) {
    throw new Error(`No image URL returned from ${XAI_IMAGE_MODEL}`);
  }

  console.log("[Room Design] Success. URL:", finalImageUrl);
  return finalImageUrl;
}
