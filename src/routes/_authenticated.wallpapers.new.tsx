import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Upload, X, ImagePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallpapers/new")({
  head: () => ({ meta: [{ title: "Add Wallpaper — Murra" }] }),
  component: AddWallpaper,
});

function AddWallpaper() {
  const [img, setImg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(f.type)) return;
    const r = new FileReader();
    r.onload = (e) => setImg(e.target?.result as string);
    r.readAsDataURL(f);
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/wallpapers"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent"
        >
          ← Back to collection
        </Link>
        <h1 className="font-serif text-5xl mt-6 mb-12">Add a wallpaper.</h1>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
          <Field label="Product Code" placeholder="EF-04-GRN" />
          <Field label="Title" placeholder="Ethereal Flora" />
          <Field label="Category" placeholder="Botanical" />

          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-3 flex items-center gap-2">
              Wallpaper Image{" "}
              <span className="text-destructive normal-case tracking-normal">*required</span>
            </span>

            {!img ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={
                  "block border-2 border-dashed aspect-[16/10] flex flex-col items-center justify-center text-center bg-card cursor-pointer transition-colors " +
                  (dragOver
                    ? "border-accent bg-accent/5"
                    : "border-brand-900/20 hover:border-accent")
                }
              >
                <Upload className="size-8 text-brand-900/40 mb-4" />
                <span className="font-serif text-3xl italic text-brand-900/55">
                  Drag &amp; drop your image
                </span>
                <span className="text-[11px] uppercase tracking-[0.2em] text-brand-900/40 mt-3">
                  or click to browse · JPG · PNG
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
            ) : (
              <div className="relative bg-card border border-brand-900/8">
                <img src={img} alt="Preview" className="w-full max-h-[480px] object-contain" />
                <button
                  type="button"
                  onClick={() => setImg(null)}
                  className="absolute top-3 right-3 size-9 grid place-items-center bg-card/90 backdrop-blur border border-brand-900/10 hover:bg-card cursor-pointer"
                  aria-label="Remove image"
                >
                  <X className="size-4" />
                </button>
                <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur px-3 py-2 border border-brand-900/10 flex items-center gap-2">
                  <ImagePlus className="size-3.5 text-accent" />
                  <span className="text-[10px] uppercase tracking-[0.2em]">Preview</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              disabled={!img}
              className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Save Wallpaper
            </button>
            <Link
              to="/wallpapers"
              className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
        {label}
      </span>
      <input
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}
