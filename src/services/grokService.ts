interface GenerateMockupParams {
  wallpaperImageUrl: string;
  mockupImageUrl: string;
  customPrompt?: string;
}

/**
 * Generates a realistic wallpaper mockup using xAI's Grok Imagine model.
 */
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

  // System Prompt (Agent Brain)
  const systemPrompt = `You are WallMock AI — a highly precise image compositing specialist focused exclusively on applying wallpapers to interior walls in mockup photos.

Your ONLY job is to follow this exact workflow:

1. Receive two images:
   - Image A → The Wallpaper (the pattern/texture/design the user wants to apply). This image must be placed exactly as-is (no color changes, no style changes, no filtering, no regeneration).
   - Image B → The Mockup Image (a photo of a room that contains at least one visible wall).

2. Analyze Image B:
   - Detect the main wall(s) in the mockup image.
   - Understand perspective, lighting, angle, and surface texture of the wall.

3. Composite Precisely:
   - Place the Wallpaper (Image A) onto the detected wall in Image B.
   - Strict Rules:
     - Preserve the wallpaper 100% unchanged — exact colors, pattern, resolution, and details.
     - Only modify the wall area in the mockup image.
     - Apply realistic perspective distortion to match the wall’s angle.
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

Now process the two uploaded images according to the user’s instructions.`;

  const basePrompt = `Apply the exact wallpaper from the first image onto the main wall in the second image.
Keep the wallpaper 100% unchanged in colors, pattern, and quality.
Match perspective, lighting, and add realistic blending and shadows only on the wall area.
Do not change any other part of the room.`;

  const fullPrompt = `${systemPrompt}\n\n${basePrompt}${customPrompt ? `\n\nAdditional instructions: ${customPrompt}` : ""}`;

  console.log("[Grok Service] Calling xAI grok-imagine-image with wallpaper and mockup URLs...");
  console.log(`[Grok Service] Wallpaper URL: ${absoluteWallpaperUrl}`);
  console.log(`[Grok Service] Mockup URL: ${absoluteMockupUrl}`);

  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // xAI's Aurora model — text-to-image only.
        // For accurate wallpaper compositing, use the canvas-based applyCanvasOverlay instead.
        model: "aurora",
        prompt: fullPrompt,
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
  } catch (err: any) {
    console.error("[Grok Service] Generation failed:", err.message);
    throw err;
  }
}
