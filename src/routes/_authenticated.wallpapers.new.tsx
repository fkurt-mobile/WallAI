import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Upload, ImagePlus, ChevronDown } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const searchSchema = z.object({
  id: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/wallpapers/new")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Add Wallpaper — Murra" }] }),
  component: AddWallpaper,
});

function AddWallpaper() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;

  const [productCode, setProductCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check for preloaded image from tools (like the image crop tool)
  useEffect(() => {
    if (typeof window !== "undefined" && window.preloadedWallpaperImage) {
      setImgFile(window.preloadedWallpaperImage.file);
      setImgPreview(window.preloadedWallpaperImage.preview);
      // Clean up to prevent reloading it if the user leaves and returns
      delete window.preloadedWallpaperImage;
      toast.success("Preloaded cropped image loaded successfully");
    }
  }, []);

  // If editing, fetch existing wallpaper details
  useEffect(() => {
    if (id) {
      const fetchWallpaper = async () => {
        const { data, error } = await supabase.from("wallpapers").select("*").eq("id", id).single();

        if (error) {
          toast.error("Failed to load wallpaper: " + error.message);
          return;
        }

        if (data) {
          setProductCode(data.product_code);
          setTitle(data.title);
          setCategory(data.category);
          setImgPreview(data.image_url);
        }
      };
      fetchWallpaper();
    }
  }, [id]);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(f.type)) {
      toast.error("Please upload a JPG or PNG image.");
      return;
    }
    setImgFile(f);
    const r = new FileReader();
    r.onload = (e) => setImgPreview(e.target?.result as string);
    r.readAsDataURL(f);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) {
      toast.error("You must be logged in to save wallpapers.");
      return;
    }
    if (!companyId) {
      toast.error("You must belong to a company to save wallpapers.");
      return;
    }
    if (!productCode.trim()) {
      toast.error("Product Code is required.");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!category) {
      toast.error("Category is required.");
      return;
    }
    if (!imgPreview) {
      toast.error("Wallpaper Image is required.");
      return;
    }

    setLoading(true);
    try {
      let imageUrl = imgPreview;

      // 1. Upload new image if one was selected
      if (imgFile) {
        const fileExt = imgFile.name.split(".").pop();
        const fileName = `${companyId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("wallpaper-images")
          .upload(fileName, imgFile, {
            upsert: true,
            contentType: imgFile.type,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from("wallpaper-images")
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      // 2. Insert or update record in database
      if (id) {
        // Edit mode
        const { error: dbError } = await supabase
          .from("wallpapers")
          .update({
            product_code: productCode.trim(),
            title: title.trim(),
            category: category.trim(),
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (dbError) throw dbError;
        toast.success("Wallpaper updated successfully");
      } else {
        // Create mode
        const { error: dbError } = await supabase.from("wallpapers").insert({
          company_id: companyId,
          user_id: profile.id,
          product_code: productCode.trim(),
          title: title.trim(),
          category: category.trim(),
          image_url: imageUrl,
        });

        if (dbError) throw dbError;
        toast.success("Wallpaper created successfully");
      }

      // Invalidate queries & redirect
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
      queryClient.invalidateQueries({ queryKey: ["wallpapers-count"] });
      queryClient.invalidateQueries({ queryKey: ["recent-wallpapers"] });

      navigate({ to: "/wallpapers" });
    } catch (err: any) {
      toast.error("Failed to save wallpaper: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/wallpapers"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent"
        >
          ← Back to collection
        </Link>
        <h1 className="font-serif text-5xl mt-6 mb-2">{id ? "Edit Wallpaper" : "Add Wallpaper"}</h1>
        <p className="text-sm text-brand-900/55 mb-12">
          {id
            ? "Update your wallpaper pattern details and file information."
            : "Upload a wallpaper pattern and add product details to your catalog."}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-12 gap-12 items-start">
            {/* Left Column: Image Upload Area */}
            <div className="md:col-span-6 lg:col-span-5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-3 flex items-center gap-1.5">
                Wallpaper Image
                <span className="text-destructive font-sans font-medium text-xs">*</span>
              </span>

              {!imgPreview ? (
                <div
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
                    "border-2 border-dashed aspect-[4/3] flex flex-col items-center justify-center text-center p-6 bg-card transition-colors " +
                    (dragOver
                      ? "border-accent bg-accent/5"
                      : "border-brand-900/15 hover:border-accent")
                  }
                >
                  <Upload className="size-8 text-brand-900/40 mb-4" />
                  <p className="font-serif text-xl italic text-brand-900/80 mb-1">
                    Drop wallpaper image here
                  </p>
                  <p className="text-[11px] text-brand-900/40 mb-6">PNG or JPG up to 20MB</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="border border-brand-900/15 bg-transparent px-6 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-900/5 transition-colors cursor-pointer"
                  >
                    Browse Files
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative bg-card border border-brand-900/8 aspect-[4/3] flex items-center justify-center overflow-hidden">
                    <img src={imgPreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between border border-brand-900/8 bg-card px-4 py-3">
                    <span className="text-xs font-mono text-brand-900/60 truncate max-w-[65%]">
                      {imgFile
                        ? imgFile.name
                        : id
                          ? "current-wallpaper-image.jpg"
                          : "wallpaper-image.jpg"}
                    </span>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="text-[10px] uppercase tracking-[0.2em] font-semibold text-accent hover:underline cursor-pointer"
                    >
                      Replace Image
                    </button>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Product details form */}
            <div className="md:col-span-6 lg:col-span-7 space-y-8">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
                  Product Code{" "}
                  <span className="text-destructive font-sans font-medium text-xs">*</span>
                </span>
                <input
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="EF-04-GRN"
                  required
                  className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors"
                />
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
                  Title <span className="text-destructive font-sans font-medium text-xs">*</span>
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ethereal Flora"
                  required
                  className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors"
                />
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
                  Category <span className="text-destructive font-sans font-medium text-xs">*</span>
                </span>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer pr-8"
                  >
                    <option value="" disabled className="text-brand-900/30">
                      Select a category...
                    </option>
                    <option value="Botanical">Botanical</option>
                    <option value="Plaster">Plaster</option>
                    <option value="Linen">Linen</option>
                    <option value="Geometric">Geometric</option>
                    <option value="Stripe">Stripe</option>
                    <option value="Abstract">Abstract</option>
                  </select>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-brand-900/40">
                    <ChevronDown className="size-4" />
                  </div>
                </div>
              </label>

              <div className="flex gap-3 pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? "Saving..." : "Save Wallpaper"}
                </button>
                <Link
                  to="/wallpapers"
                  className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors flex items-center justify-center cursor-pointer"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
