export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous"); // Prevents CORS issues for external URLs
    image.src = url;
  });

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops a source image canvas-style based on pixel-crop coordinates from react-easy-crop.
 * Returns an object containing the temporary blob URL and the raw Blob object.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<{ url: string; blob: Blob } | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  // Set the canvas size to the cropped dimensions
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the specified crop region onto the canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas crop failed"));
        return;
      }
      resolve({
        url: URL.createObjectURL(blob),
        blob,
      });
    }, "image/png"); // High-quality output
  });
}
