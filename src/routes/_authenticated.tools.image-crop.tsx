import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Crop, Upload, ZoomIn, ZoomOut, RotateCcw, Download, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools/image-crop")({
  head: () => ({ meta: [{ title: "Image Crop — Murra Tools" }] }),
  component: ImageCropTool,
});

function ImageCropTool() {
  const [img, setImg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => setImg(e.target?.result as string);
    r.readAsDataURL(file);
  }

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
          <div className="bg-brand-900 rounded-md min-h-[560px] flex items-center justify-center overflow-hidden relative">
            {!img ? (
              <label className="cursor-pointer text-center text-brand-50/70 p-16">
                <Upload className="size-10 mx-auto mb-5 opacity-60" />
                <p className="font-serif text-3xl italic text-brand-50">Drop an image to begin</p>
                <p className="text-[11px] uppercase tracking-[0.2em] mt-3 text-brand-50/45">
                  JPG · PNG · click to browse
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center p-10">
                <img
                  src={img}
                  alt="Crop"
                  style={{ transform: `scale(${zoom})` }}
                  className="max-w-full max-h-[60vh] object-contain transition-transform duration-300"
                />
                {/* Crop overlay */}
                <div className="absolute inset-[12%] border-2 border-gilded pointer-events-none">
                  {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((p) => (
                    <span
                      key={p}
                      className={
                        "absolute size-3 bg-gilded " +
                        (p === "top-left"
                          ? "-top-1.5 -left-1.5"
                          : p === "top-right"
                            ? "-top-1.5 -right-1.5"
                            : p === "bottom-left"
                              ? "-bottom-1.5 -left-1.5"
                              : "-bottom-1.5 -right-1.5")
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <aside className="bg-card border border-brand-900/8 p-6 self-start space-y-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3">
                Source
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border border-brand-900/12 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-50 cursor-pointer"
              >
                <Upload className="size-3.5" /> {img ? "Replace image" : "Upload image"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3">View</p>
              <div className="grid grid-cols-3 gap-2">
                <ToolBtn onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                  <ZoomIn className="size-3.5" /> In
                </ToolBtn>
                <ToolBtn onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                  <ZoomOut className="size-3.5" /> Out
                </ToolBtn>
                <ToolBtn onClick={() => setZoom(1)}>
                  <RotateCcw className="size-3.5" /> Reset
                </ToolBtn>
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40 mt-2">
                Zoom · {Math.round(zoom * 100)}%
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3">Crop</p>
              <div className="space-y-2">
                <button
                  disabled={!img}
                  className="w-full flex items-center justify-center gap-2 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-800 disabled:opacity-40 cursor-pointer"
                >
                  <Check className="size-3.5" /> Apply Crop
                </button>
                <button
                  disabled={!img}
                  className="w-full flex items-center justify-center gap-2 border border-brand-900/15 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-50 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="size-3.5" /> Download Cropped
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function ToolBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1 border border-brand-900/12 py-2 text-[10px] uppercase tracking-[0.16em] hover:border-accent hover:text-accent transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}
