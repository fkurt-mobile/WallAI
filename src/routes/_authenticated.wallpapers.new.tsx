import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Upload, X, ImagePlus } from "lucide-react";
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

  // If editing, fetch existing wallpaper details
  useEffect(() => {
    if (id) {
      const fetchWallpaper = async () => {
        const { data, error } = await supabase
          .from("wallpapers")
          .select("*")
          .eq("id", id)
          .single();

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
    if (!companyId) {
      toast.error("You must belong to a company to save wallpapers.");
      return;
    }
    if (!productCode.trim() || !title.trim() || !category.trim()) {
      toast.error("Please fill in all text fields.");
      return;
    }
    if (!imgPreview) {
      toast.error("An image is required.");
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
        const { error: dbError } = await supabase
          .from("wallpapers")
          .insert({
            company_id: companyId,
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
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/wallpapers"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent"
        >
          ← Back to collection
        </Link>
        <h1 className="font-serif text-5xl mt-6 mb-12">
          {id ? "Edit wallpaper." : "Add a wallpaper."}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Field 
            label="Product Code" 
            placeholder="EF-04-GRN" 
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            required
          />
          <Field 
            label="Title" 
            placeholder="Ethereal Flora" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Field 
            label="Category" 
            placeholder="Botanical" 
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />

          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-3 flex items-center gap-2">
              Wallpaper Image{" "}
              <span className="text-destructive normal-case tracking-normal">*required</span>
            </span>

            {!imgPreview ? (
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
                <img src={imgPreview} alt="Preview" className="w-full max-h-[480px] object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setImgPreview(null);
                    setImgFile(null);
                  }}
                  className="absolute top-3 right-3 size-9 grid place-items-center bg-card/90 backdrop-blur border border-brand-900/10 hover:bg-card cursor-pointer"
                  aria-label="Remove image"
                  disabled={loading}
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
              type="submit"
              disabled={!imgPreview || loading}
              className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? "Saving..." : "Save Wallpaper"}
            </button>
            <Link
              to="/wallpapers"
              className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors flex items-center justify-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

function Field({ label, placeholder, value, onChange, required }: FieldProps) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
        {label}
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}
