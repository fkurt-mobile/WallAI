/**
 * perspective.ts — Wall detection + wallpaper compositing utilities.
 *
 * Primary export: compositeWallpaper()
 *   1. Auto-detects the dominant wall via color sampling
 *   2. Places the wallpaper as ONE scaled image on the wall (no tiling)
 *   3. Uses per-pixel soft-alpha masking to preserve furniture:
 *      pixels that match the wall color → transparent → wallpaper shows through
 *      pixels that differ (furniture, headboard, decor) → opaque → stay visible
 */

/** Loads an <img> from any URL, with CORS enabled. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Auto-detects the dominant back-wall region in a room mockup photo.
 *
 * Strategy:
 *   1. Sample the upper-center 40 % × 28 % strip → average color = wall color
 *   2. Scan left / right at 30 % height to find horizontal wall extent
 *   3. Scan rows downward (35 %–85 % height) to find where wall color disappears
 *      (i.e. where furniture / floor starts)
 *
 * Returns normalized [[x,y], …] quad in [0..1] space: [TL, TR, BR, BL].
 */
export async function detectWallBounds(
  image: HTMLImageElement
): Promise<[number, number][]> {
  const W = image.naturalWidth || image.width;
  const H = image.naturalHeight || image.height;

  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const ctx = tmp.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  // ── Step 1: sample center-top strip for wall colour ───────────────────
  const sx = Math.floor(W * 0.30);
  const sy = Math.floor(H * 0.04);
  const sw = Math.floor(W * 0.40);
  const sh = Math.floor(H * 0.28);
  const sample = ctx.getImageData(sx, sy, sw, sh).data;

  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (let i = 0; i < sample.length; i += 4) {
    rSum += sample[i]; gSum += sample[i + 1]; bSum += sample[i + 2]; n++;
  }
  const wallR = rSum / n;
  const wallG = gSum / n;
  const wallB = bSum / n;

  const THRESH = 45;

  const full = ctx.getImageData(0, 0, W, H).data;

  const isWall = (x: number, y: number): boolean => {
    const idx = (Math.floor(y) * W + Math.floor(x)) * 4;
    return (
      Math.abs(full[idx]     - wallR) +
      Math.abs(full[idx + 1] - wallG) +
      Math.abs(full[idx + 2] - wallB)
    ) < THRESH * 3;
  };

  // ── Step 2: horizontal extent at 30 % height ─────────────────────────
  const scanY = Math.floor(H * 0.30);
  let wallLeft = 0;
  let wallRight = W;

  for (let x = 0; x < Math.floor(W * 0.5); x++) {
    if (isWall(x, scanY)) { wallLeft = x; break; }
  }
  for (let x = W - 1; x >= Math.floor(W * 0.5); x--) {
    if (isWall(x, scanY)) { wallRight = x; break; }
  }

  // ── Step 3: scan downward to find wall bottom ─────────────────────────
  const checkXStart = Math.floor(W * 0.25);
  const checkXEnd   = Math.floor(W * 0.75);
  const checkW = checkXEnd - checkXStart;
  let wallBottom = H * 0.65; // safe default

  for (let y = Math.floor(H * 0.35); y < Math.floor(H * 0.86); y++) {
    let match = 0;
    for (let x = checkXStart; x < checkXEnd; x++) {
      if (isWall(x, y)) match++;
    }
    if (match / checkW < 0.22) {
      wallBottom = y;
      break;
    }
  }

  wallLeft   = Math.max(0, wallLeft);
  wallRight  = Math.min(W, wallRight);
  wallBottom = Math.min(H * 0.87, wallBottom);

  console.log(
    `[detectWallBounds] colour=(${wallR.toFixed(0)},${wallG.toFixed(0)},${wallB.toFixed(0)})`,
    `bounds: L=${(wallLeft/W).toFixed(2)} R=${(wallRight/W).toFixed(2)} B=${(wallBottom/H).toFixed(2)}`
  );

  return [
    [wallLeft  / W, 0.0],
    [wallRight / W, 0.0],
    [wallRight / W, wallBottom / H],
    [wallLeft  / W, wallBottom / H],
  ];
}

/**
 * Composites the wallpaper onto the mockup room image.
 *
 * Algorithm:
 *   1. Auto-detect wall polygon from colour (or use provided quadPoints).
 *   2. Sample the wall colour from the polygon's upper-centre area.
 *   3. Clip to wall polygon → draw wallpaper SCALED TO FIT (single image, never tiled).
 *   4. Build a smart room overlay with per-pixel soft alpha:
 *        - pixel colour close to wall colour  → alpha ≈ 0   (transparent → wallpaper shows)
 *        - pixel colour different from wall   → alpha = 255 (opaque → furniture preserved)
 *      The transition is smooth (soft-edge masking, not binary chroma key).
 *   5. Draw the smart overlay on top of the wallpaper.
 *   6. Add a very subtle multiply pass in the wall area only for realistic lighting.
 *
 * @param mockupSrc     Public URL of the room mockup image.
 * @param wallpaperSrc  Public URL of the wallpaper image.
 * @param quadPoints    Normalised [0..1] quad, or null/empty → auto-detect.
 */
export async function compositeWallpaper(
  mockupSrc: string,
  wallpaperSrc: string,
  quadPoints: [number, number][] | null
): Promise<string> {
  const [mockupImg, wallpaperImg] = await Promise.all([
    loadImage(mockupSrc),
    loadImage(wallpaperSrc),
  ]);

  const W = mockupImg.naturalWidth  || mockupImg.width;
  const H = mockupImg.naturalHeight || mockupImg.height;

  // ── Resolve wall polygon ────────────────────────────────────────────────
  const needsAutoDetect =
    !quadPoints ||
    quadPoints.length === 0 ||
    (quadPoints[0][0] === 0 && quadPoints[1][0] === 1.0);

  let quad: [number, number][];
  if (needsAutoDetect) {
    try {
      quad = await detectWallBounds(mockupImg);
    } catch (e) {
      console.warn("[compositeWallpaper] Auto-detection failed, using conservative default:", e);
      quad = [[0.05, 0.0], [0.95, 0.0], [0.95, 0.65], [0.05, 0.65]];
    }
  } else {
    quad = quadPoints!;
  }

  const pxQuad = quad.map(([nx, ny]) => [nx * W, ny * H] as [number, number]);

  const xs = pxQuad.map(p => p[0]);
  const ys = pxQuad.map(p => p[1]);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));

  // ── Sample wall colour from the upper-centre of the detected polygon ────
  const colW = Math.max(10, Math.min(80, Math.floor((maxX - minX) * 0.15)));
  const colH = Math.max(10, Math.min(80, Math.floor((maxY - minY) * 0.12)));
  const colX = Math.max(0, Math.floor((minX + maxX) / 2 - colW / 2));
  const colY = Math.max(0, Math.floor(minY + (maxY - minY) * 0.08));

  const colCanvas = document.createElement("canvas");
  colCanvas.width = W;
  colCanvas.height = H;
  const colCtx = colCanvas.getContext("2d")!;
  colCtx.drawImage(mockupImg, 0, 0);

  const wallSample = colCtx.getImageData(colX, colY, colW, colH).data;
  let wallR = 0, wallG = 0, wallB = 0, wn = 0;
  for (let i = 0; i < wallSample.length; i += 4) {
    wallR += wallSample[i]; wallG += wallSample[i + 1]; wallB += wallSample[i + 2]; wn++;
  }
  wallR /= wn; wallG /= wn; wallB /= wn;
  console.log(`[compositeWallpaper] wall colour: rgb(${wallR.toFixed(0)},${wallG.toFixed(0)},${wallB.toFixed(0)})`);

  // ── Helper: trace the wall polygon path ──────────────────────────────────
  const tracePoly = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    pxQuad.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  };

  // ── Is this a simple rectangle? (all auto-detected quads are rectangles) ─
  const isRect =
    pxQuad[0][0] === pxQuad[3][0] &&
    pxQuad[1][0] === pxQuad[2][0] &&
    pxQuad[0][1] === pxQuad[1][1] &&
    pxQuad[2][1] === pxQuad[3][1];

  const inPoly = isRect
    ? (x: number, y: number) =>
        x >= minX && x <= maxX && y >= minY && y <= maxY
    : (x: number, y: number) => {
        let inside = false;
        for (let i = 0, j = pxQuad.length - 1; i < pxQuad.length; j = i++) {
          const [xi, yi] = pxQuad[i];
          const [xj, yj] = pxQuad[j];
          if (
            (yi > y) !== (yj > y) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
          ) {
            inside = !inside;
          }
        }
        return inside;
      };

  // ── Final canvas ──────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Step 1 ── Draw wallpaper (ONE image, scaled to fit wall bounding box)
  ctx.save();
  tracePoly(ctx);
  ctx.clip();
  ctx.drawImage(wallpaperImg, minX, minY, maxX - minX, maxY - minY);
  ctx.restore();

  // Step 2 ── Build smart room overlay with per-pixel soft alpha
  //
  //  Inside wall polygon:
  //    colour matches wall → alpha = 0   (transparent → wallpaper visible)
  //    colour differs      → alpha = 255 (opaque     → furniture visible)
  //
  //  Outside wall polygon:
  //    always alpha = 255 (floor, ceiling, windows untouched)
  //
  const roomCanvas = document.createElement("canvas");
  roomCanvas.width = W;
  roomCanvas.height = H;
  const roomCtx = roomCanvas.getContext("2d")!;
  roomCtx.drawImage(mockupImg, 0, 0);

  const imgData = roomCtx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Threshold: Manhattan distance per channel at which a pixel is "furniture"
  // 45 works well for most neutral walls; furniture colours are far enough away.
  const COLOUR_THRESHOLD = 45;
  const MAX_DIST = COLOUR_THRESHOLD * 3; // max Manhattan distance (3 channels)

  for (let y = minY; y <= Math.min(maxY, H - 1); y++) {
    for (let x = minX; x <= Math.min(maxX, W - 1); x++) {
      // For non-rectangular polygons do a proper point-in-polygon test
      if (!isRect && !inPoly(x, y)) continue;

      const idx = (y * W + x) * 4;
      const dist =
        Math.abs(data[idx]     - wallR) +
        Math.abs(data[idx + 1] - wallG) +
        Math.abs(data[idx + 2] - wallB);

      // Smooth ramp: 0 at dist=0 (pure wall) → 255 at dist=MAX_DIST (pure furniture)
      // Clamp so anything beyond threshold is fully opaque (guaranteed furniture)
      data[idx + 3] = Math.min(255, Math.round((dist / MAX_DIST) * 255));
    }
  }

  roomCtx.putImageData(imgData, 0, 0);

  // Step 3 ── Draw smart overlay on top of wallpaper
  ctx.drawImage(roomCanvas, 0, 0);

  // Step 4 ── Subtle multiply lighting inside wall polygon only
  // (adds the room's natural shadow/gradient on the wallpaper → looks realistic)
  ctx.save();
  tracePoly(ctx);
  ctx.clip();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.22;
  ctx.drawImage(mockupImg, 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.95);
}

// ── Legacy helpers (kept for reference, no longer used by compositeWallpaper) ─

/** @deprecated — use compositeWallpaper() instead */
export function warpQuadrilateral(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  srcWidth: number,
  srcHeight: number,
  quad: [number, number][]
) {
  const drawTri = (
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    u0: number, v0: number, u1: number, v1: number, u2: number, v2: number
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.closePath(); ctx.clip();
    const det = (u0 - u2) * (v1 - v2) - (u1 - u2) * (v0 - v2);
    if (det === 0) { ctx.restore(); return; }
    const a = ((x0 - x2) * (v1 - v2) - (x1 - x2) * (v0 - v2)) / det;
    const b = ((x1 - x2) * (u0 - u2) - (x0 - x2) * (u1 - u2)) / det;
    const c = x0 - a * u0 - b * v0;
    const d = ((y0 - y2) * (v1 - v2) - (y1 - y2) * (v0 - v2)) / det;
    const e = ((y1 - y2) * (u0 - u2) - (y0 - y2) * (u1 - u2)) / det;
    const f = y0 - d * u0 - e * v0;
    ctx.transform(a, d, b, e, c, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };
  const [p0, p1, p2, p3] = quad;
  drawTri(p0[0], p0[1], p1[0], p1[1], p3[0], p3[1], 0, 0, srcWidth, 0, 0, srcHeight);
  drawTri(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], srcWidth, 0, srcWidth, srcHeight, 0, srcHeight);
}

/** @deprecated — use compositeWallpaper() instead */
export function createTiledWallpaperCanvas(
  wallpaperImg: HTMLImageElement,
  width = 1024,
  height = 1024
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const pattern = ctx.createPattern(wallpaperImg, "repeat");
  if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, width, height); }
  else ctx.drawImage(wallpaperImg, 0, 0, width, height);
  return canvas;
}
