import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { categories, type Wallpaper } from "@/lib/wallpapers/data";
import { WallpaperModal } from "@/components/site/wallpaper-modal";
import { Plus, Eye, Pencil, Trash2, ImagePlus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/wallpapers/")({
  head: () => ({
    meta: [
      { title: "Wallpapers — Murra" },
      { name: "description", content: "Browse the curated wallpaper catalog." },
    ],
  }),
  component: WallpaperList,
});

function WallpaperList() {
  const queryClient = useQueryClient();
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Wallpaper | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Wallpaper | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data: profile, isLoading: profileLoading } = useProfile();
  const companyId = profile?.company_id;

  // Query real wallpapers from database
  const { data: dbWallpapers = [], isLoading: wallpapersLoading } = useQuery({
    queryKey: ["wallpapers", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const wallpapersList: Wallpaper[] = dbWallpapers.map((w) => ({
    id: w.id,
    code: w.product_code,
    title: w.title,
    category: w.category,
    image: w.image_url,
    tint: "",
  }));

  const requestDelete = (id: string, imageUrl: string) => {
    const wallpaper = wallpapersList.find((w) => w.id === id) || null;
    setDeleteTarget(
      wallpaper || {
        id,
        image: imageUrl,
        title: "this wallpaper",
        code: "",
        category: "",
        tint: "",
      },
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      // 1. Delete database record (cascades or set null on visualizations depending on schema, we set null or cascade)
      const { error: dbError } = await supabase
        .from("wallpapers")
        .delete()
        .eq("id", deleteTarget.id);

      if (dbError) throw dbError;

      // 2. Delete storage file if it exists in Supabase Storage
      if (deleteTarget.image.includes("/wallpaper-images/")) {
        const path = deleteTarget.image.split("/wallpaper-images/")[1];
        if (path) {
          await supabase.storage.from("wallpaper-images").remove([path]);
        }
      }

      toast.success("Wallpaper deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
      queryClient.invalidateQueries({ queryKey: ["wallpapers-count"] });
      queryClient.invalidateQueries({ queryKey: ["recent-wallpapers"] });
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to delete wallpaper: " + message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = wallpapersList.filter(
    (w) =>
      (cat === "All" || w.category === cat) &&
      (query === "" ||
        w.title.toLowerCase().includes(query.toLowerCase()) ||
        w.code.toLowerCase().includes(query.toLowerCase())),
  );

  const isLoading = profileLoading || wallpapersLoading;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 md:sticky md:top-0 md:bg-background/85 md:backdrop-blur md:z-20 md:py-4 md:-mx-2 md:px-2">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              Collection
            </span>
            <h1 className="font-serif text-5xl md:text-6xl mt-3">All Wallpapers</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 md:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              className="bg-card border border-brand-900/10 px-4 py-3 w-full sm:w-72 text-sm focus:outline-none focus:border-accent"
            />
            <Link
              to="/wallpapers/new"
              className="inline-flex items-center justify-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors whitespace-nowrap"
            >
              <Plus className="size-3.5" /> Add Wallpaper
            </Link>
          </div>
        </div>

        <div className="flex gap-1 mb-10 overflow-x-auto border-b border-brand-900/5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={
                "px-4 py-3 text-[11px] uppercase tracking-[0.2em] border-b-2 -mb-px transition-colors " +
                (cat === c
                  ? "border-brand-900 text-brand-900"
                  : "border-transparent text-brand-900/50 hover:text-brand-900")
              }
            >
              {c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-center text-brand-900/50 py-20 font-serif text-2xl italic">
            Loading wallpapers...
          </p>
        ) : wallpapersList.length === 0 ? (
          <EmptyCatalog />
        ) : filtered.length === 0 ? (
          <p className="text-center text-brand-900/50 py-20 font-serif text-2xl italic">
            No wallpapers match your search.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {filtered.map((w) => (
              <div key={w.id} className="group relative text-left">
                <button
                  type="button"
                  onClick={() => setActive(w)}
                  className="block w-full text-left cursor-pointer"
                >
                  <div className="aspect-square overflow-hidden bg-brand-100 relative">
                    <img
                      src={w.image}
                      alt={w.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-brand-900/0 group-hover:bg-brand-900/35 transition-colors pointer-events-none" />
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                      {w.code}
                    </p>
                    <p className="text-base font-medium mt-1">{w.title}</p>
                    <p className="text-xs text-brand-900/50 mt-0.5">{w.category}</p>
                  </div>
                </button>
                <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                  <CardAction label="Open" onClick={() => setActive(w)}>
                    <Eye className="size-3.5" />
                  </CardAction>
                  <CardAction label="Edit" to="/wallpapers/new" search={{ id: w.id }}>
                    <Pencil className="size-3.5" />
                  </CardAction>
                  <CardAction label="Delete" onClick={() => requestDelete(w.id, w.image)} danger>
                    <Trash2 className="size-3.5" />
                  </CardAction>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <WallpaperModal
        wallpaper={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        onDelete={requestDelete}
      />
      <DeleteWallpaperDialog
        wallpaper={deleteTarget}
        open={!!deleteTarget}
        loading={deleteLoading}
        onCancel={() => !deleteLoading && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}

function DeleteWallpaperDialog({
  wallpaper,
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  wallpaper: Wallpaper | null;
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AlertDialogContent className="max-w-md border-0 bg-card p-0 shadow-2xl sm:rounded-lg overflow-hidden">
        <div className="p-7">
          <div className="mb-5 flex items-start gap-4">
            <div className="size-11 shrink-0 rounded-full bg-destructive/8 text-destructive grid place-items-center">
              <Trash2 className="size-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium mb-2">
                Delete Wallpaper
              </p>
              <AlertDialogTitle className="font-serif text-3xl italic font-normal leading-tight">
                Remove {wallpaper?.title || "this wallpaper"}?
              </AlertDialogTitle>
            </div>
          </div>
          <AlertDialogDescription className="text-sm leading-6 text-brand-900/60">
            This will delete the wallpaper from your catalog and remove any related visualizations.
            This action cannot be undone.
          </AlertDialogDescription>
        </div>
        <div className="border-t border-brand-900/8 bg-brand-50/70 px-7 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="border border-brand-900/12 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CardAction({
  children,
  label,
  onClick,
  to,
  search,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  search?: { id: string };
  danger?: boolean;
}) {
  const cls =
    "size-8 grid place-items-center bg-card/95 backdrop-blur border border-brand-900/10 shadow-sm transition-colors cursor-pointer " +
    (danger
      ? "hover:bg-destructive hover:text-destructive-foreground"
      : "hover:bg-accent hover:text-accent-foreground");
  if (to) {
    return (
      <Link to={to} search={search} title={label} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function EmptyCatalog() {
  return (
    <div className="border border-dashed border-brand-900/15 bg-card py-24 px-8 text-center">
      <div className="mx-auto size-16 grid place-items-center rounded-full bg-brand-100 mb-6">
        <ImagePlus className="size-7 text-brand-900/50" />
      </div>
      <h2 className="font-serif text-4xl italic mb-3">No wallpapers added yet</h2>
      <p className="text-brand-900/55 max-w-md mx-auto mb-8">
        Upload your first wallpaper to start creating visualizations.
      </p>
      <Link
        to="/wallpapers/new"
        className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
      >
        <Plus className="size-3.5" /> Upload First Wallpaper
      </Link>
    </div>
  );
}
