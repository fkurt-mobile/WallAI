import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Crop, Upload, ZoomIn, ZoomOut, RotateCcw, Download, Check, X, Trash2 } from "lucide-react";
import Cropper from "react-easy-crop";
import { getCroppedImg, Area } from "@/utils/cropImage";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tools/image-crop")({
  head: () => ({ meta: [{ title: "Image Crop — Murra Tools" }] }),
  component: ImageCropTool,
});

interface CroppedImage {
  id: string;
  url: string;
  blob: Blob;
  fileName: string;
  createdAt: Date;
}

declare global {
  interface Window {
    preloadedWallpaperImage?: {
      file: File;
      preview: string;
    };
  }
}

function ImageCropTool() {
  const navigate = useNavigate();
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [selectedCroppedImageId, setSelectedCroppedImageId] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    // Validate type
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      const msg = "Only JPG and PNG files are supported";
      setErrorMessage(msg);
      setSuccessMessage(null);
      toast.error(msg);
      return;
    }

    // Validate size (20MB)
    if (file.size > 20 * 1024 * 1024) {
      const msg = "File size exceeds 20MB. Please select a smaller image.";
      setErrorMessage(msg);
      setSuccessMessage(null);
      toast.error(msg);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage("Image uploaded");
    toast.success("Image uploaded");

    // Reset crop and zoom for the new image
    setCrop({ x: 0, y: 0 });
    setZoom(1);

    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  const handleZoomIn = () => {
    setZoom((z) => Math.min(3, z + 0.25));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(1, z - 0.25));
  };

  const handleReset = () => {
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    toast.success("Zoom and crop selection reset");
  };

  const handleApplyCrop = async () => {
    if (!sourceImage || !croppedAreaPixels) {
      toast.error("Please upload an image first");
      return;
    }

    setIsCropping(true);
    try {
      const result = await getCroppedImg(sourceImage, croppedAreaPixels);
      if (result) {
        const newCrop: CroppedImage = {
          id: Math.random().toString(36).substring(7),
          url: result.url,
          blob: result.blob,
          fileName: `cropped-wallpaper-${Date.now()}.png`,
          createdAt: new Date(),
        };

        setCroppedImages((prev) => [...prev, newCrop]);
        toast.success("Cropped image created");
      } else {
        toast.error("Unable to crop image. Please try again");
      }
    } catch (err: any) {
      toast.error("Unable to crop image. Please try again");
    } finally {
      setIsCropping(false);
    }
  };

  const handleDownload = () => {
    if (croppedImages.length === 0) {
      toast.error("Apply a crop before downloading");
      return;
    }

    // Download selected or latest cropped image
    const target =
      croppedImages.find((c) => c.id === selectedCroppedImageId) ||
      croppedImages[croppedImages.length - 1];

    downloadImage(target.url, target.fileName);
  };

  const downloadImage = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Image downloaded");
  };

  const handleDeleteCrop = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCroppedImages((prev) => prev.filter((c) => c.id !== id));
    if (selectedCroppedImageId === id) {
      setSelectedCroppedImageId(null);
    }
    toast.success("Cropped image removed");
  };

  const handleUseAsWallpaper = (cropItem: CroppedImage) => {
    const file = new File([cropItem.blob], cropItem.fileName, { type: cropItem.blob.type });
    window.preloadedWallpaperImage = {
      file: file,
      preview: cropItem.url,
    };
    toast.success("Image set as template. Redirecting to wallpaper creation...");
    navigate({ to: "/wallpapers/new" });
  };

  const selectedCrop = croppedImages.find((c) => c.id === selectedCroppedImageId);

  return (
    <AppShell>
      <div className="px-6 lg:px-10 py-10 max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-accent font-medium flex items-center gap-2">
              <Crop className="size-3.5" /> Tools · Image Crop
            </p>
            <h1 className="font-serif text-5xl mt-3">Prepare your wallpaper.</h1>
            <p className="text-brand-900/55 mt-2 max-w-md">
              Trim, zoom, and crop wallpaper images before adding them to the catalog.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Workspace */}
          <div className="bg-[#111] rounded-md min-h-[600px] flex items-center justify-center overflow-hidden relative border border-brand-900/10 shadow-inner">
            {!sourceImage ? (
              <label className="cursor-pointer text-center text-brand-50/70 p-16 w-full h-full flex flex-col items-center justify-center">
                <Upload className="size-10 mx-auto mb-5 opacity-60 text-accent" />
                <p className="font-serif text-3xl italic text-brand-50">Drop an image to begin</p>
                <p className="text-[11px] uppercase tracking-[0.2em] mt-3 text-brand-50/45">
                  JPG · PNG · click to browse
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            ) : (
              <div className="absolute inset-0">
                <Cropper
                  image={sourceImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={undefined}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                />
              </div>
            )}
          </div>

          {/* Toolbar */}
          <aside className="bg-card border border-brand-900/8 p-6 self-start space-y-6 rounded-md shadow-sm">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3 font-semibold">
                Source
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border border-brand-900/12 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-100/50 transition-colors cursor-pointer font-medium"
              >
                <Upload className="size-3.5 text-brand-900/60" />{" "}
                {sourceImage ? "Replace image" : "Upload image"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3 font-semibold">
                View
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ToolBtn onClick={handleZoomIn} disabled={!sourceImage}>
                  <ZoomIn className="size-3.5" /> In
                </ToolBtn>
                <ToolBtn onClick={handleZoomOut} disabled={!sourceImage}>
                  <ZoomOut className="size-3.5" /> Out
                </ToolBtn>
                <ToolBtn onClick={handleReset} disabled={!sourceImage}>
                  <RotateCcw className="size-3.5" /> Reset
                </ToolBtn>
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40 mt-3 font-medium">
                Zoom · {Math.round(zoom * 100)}%
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3 font-semibold">
                Crop Actions
              </p>
              <div className="space-y-2">
                <button
                  disabled={!sourceImage || isCropping}
                  onClick={handleApplyCrop}
                  className="w-full flex items-center justify-center gap-2 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium"
                >
                  <Check className="size-3.5" /> {isCropping ? "Cropping..." : "Apply Crop"}
                </button>
                <button
                  disabled={croppedImages.length === 0}
                  onClick={handleDownload}
                  title={croppedImages.length === 0 ? "Apply a crop first" : ""}
                  className="w-full flex items-center justify-center gap-2 border border-brand-900/15 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-100/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium"
                >
                  <Download className="size-3.5" /> Download Cropped
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom Gallery Section */}
        {croppedImages.length > 0 && (
          <div className="mt-12 border-t border-brand-900/8 pt-8">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-brand-900/55 mb-5 font-semibold">
              Cropped Images Gallery
            </h2>
            <div className="flex flex-wrap gap-4">
              {croppedImages.map((cropItem, index) => {
                const isSelected = selectedCroppedImageId === cropItem.id;
                return (
                  <div
                    key={cropItem.id}
                    onClick={() => setSelectedCroppedImageId(cropItem.id)}
                    className={`group relative w-36 bg-card border rounded overflow-hidden cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "border-accent ring-1 ring-accent"
                        : "border-brand-900/10 hover:border-brand-900/30"
                    }`}
                  >
                    <div className="aspect-[4/3] w-full bg-[#111] flex items-center justify-center relative overflow-hidden">
                      <img
                        src={cropItem.url}
                        alt={`Crop ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                      />
                      <button
                        onClick={(e) => handleDeleteCrop(e, cropItem.id)}
                        className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-destructive text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        title="Delete crop"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    <div className="p-2 text-center border-t border-brand-900/5">
                      <p className="text-[10px] font-medium text-brand-900/80">Crop {index + 1}</p>
                      <p className="text-[9px] text-brand-900/40 font-mono mt-0.5">
                        {cropItem.createdAt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {selectedCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 transition-opacity duration-300">
          <div className="bg-card border border-brand-900/15 max-w-4xl w-full max-h-[90vh] overflow-hidden rounded shadow-2xl flex flex-col md:grid md:grid-cols-[1fr_320px] relative animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button Top Right */}
            <button
              onClick={() => setSelectedCroppedImageId(null)}
              className="absolute top-4 right-4 text-brand-900/50 hover:text-brand-900 bg-brand-100/50 hover:bg-brand-100 p-1.5 rounded-full z-10 cursor-pointer transition-colors"
            >
              <X className="size-4" />
            </button>

            {/* Left Column: Image Preview */}
            <div className="bg-[#181818] p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-brand-900/10 min-h-[300px] max-h-[50vh] md:max-h-full">
              <img
                src={selectedCrop.url}
                alt={selectedCrop.fileName}
                className="max-w-full max-h-[40vh] md:max-h-[60vh] object-contain shadow-lg"
              />
            </div>

            {/* Right Column: Actions */}
            <div className="p-6 flex flex-col justify-between h-full space-y-8 bg-card">
              <div className="space-y-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 font-semibold">
                  Crop Details
                </p>
                <h3 className="font-serif text-2xl text-brand-900 truncate">
                  {selectedCrop.fileName}
                </h3>
                <div className="space-y-1.5 text-xs text-brand-900/60 font-mono">
                  <p>Created: {selectedCrop.createdAt.toLocaleString()}</p>
                  <p>Format: PNG Image</p>
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-brand-900/8">
                <button
                  onClick={() => downloadImage(selectedCrop.url, selectedCrop.fileName)}
                  className="w-full flex items-center justify-center gap-2 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-800 transition-colors cursor-pointer font-medium"
                >
                  <Download className="size-3.5" /> Download PNG
                </button>
                <button
                  onClick={() => handleUseAsWallpaper(selectedCrop)}
                  className="w-full flex items-center justify-center gap-2 border border-accent text-brand-900 hover:bg-accent/5 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors cursor-pointer font-semibold text-accent"
                >
                  Use as Wallpaper
                </button>
                <button
                  onClick={() => setSelectedCroppedImageId(null)}
                  className="w-full flex items-center justify-center gap-2 border border-brand-900/10 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-100/50 transition-colors cursor-pointer font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ToolBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1 border border-brand-900/12 py-2.5 text-[10px] uppercase tracking-[0.16em] hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-brand-900/12 disabled:hover:text-foreground transition-colors cursor-pointer font-medium"
    >
      {children}
    </button>
  );
}
