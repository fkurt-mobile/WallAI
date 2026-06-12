import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ZoomIn, Pencil, Trash2, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { type Wallpaper } from "@/lib/wallpapers/data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  wallpaper: Wallpaper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string, imageUrl: string) => void;
}

export function WallpaperModal({ wallpaper, open, onOpenChange, onDelete }: Props) {
  const navigate = useNavigate();
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) {
      setZoomed(false);
    }
  }, [open]);

  // Fetch real visualizations history from Supabase for this wallpaper
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["wallpaper-visualizations", wallpaper?.id],
    queryFn: async () => {
      if (!wallpaper?.id) return [];
      const { data, error } = await supabase
        .from("visualizations")
        .select("id, result_image_url, preview_image_url, room_type, style, mood, created_at")
        .eq("wallpaper_id", wallpaper.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data.map((v) => ({
        id: v.id,
        room: v.room_type || "Room",
        style: v.style || "Style",
        mood: v.mood || "Mood",
        createdAt: new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        image: v.preview_image_url || v.result_image_url,
        wallpaperTitle: wallpaper.title,
      }));
    },
    enabled: open && !!wallpaper?.id,
  });

  if (!wallpaper) return null;

  const visualize = () => {
    onOpenChange(false);
    navigate({ to: "/tools/wallpaper-visualizer", search: { wallpaper: wallpaper.id } });
  };

  const editWallpaper = () => {
    onOpenChange(false);
    navigate({ to: "/wallpapers/new", search: { id: wallpaper.id } });
  };

  const deleteWallpaper = () => {
    if (onDelete) {
      onDelete(wallpaper.id, wallpaper.image);
      onOpenChange(false);
    }
  };

  const scrollGallery = (dir: -1 | 1) => {
    const el = document.getElementById("viz-history-scroll");
    if (el) el.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 bg-brand-50 sm:rounded-lg overflow-hidden shadow-2xl"
        style={{ width: "85vw", maxWidth: "85vw", height: "85vh" }}
      >
        <DialogTitle className="sr-only">{wallpaper.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {wallpaper.category} wallpaper — {wallpaper.code}
        </DialogDescription>

        <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] h-full">
          {/* LEFT — preview */}
          <div className="relative bg-brand-100 p-8 lg:p-12 flex items-center justify-center group overflow-hidden">
            <button
              onClick={() => setZoomed((z) => !z)}
              className="absolute top-6 right-6 z-10 size-10 grid place-items-center rounded-full bg-card/90 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card cursor-pointer"
              aria-label="Toggle zoom"
            >
              <ZoomIn className="size-4 text-brand-900" />
            </button>
            <img
              src={wallpaper.image}
              alt={wallpaper.title}
              className={
                "max-w-full max-h-full object-contain rounded-md shadow-xl transition-transform duration-500 " +
                (zoomed ? "scale-150 cursor-zoom-out" : "scale-100 cursor-zoom-in")
              }
              onClick={() => setZoomed((z) => !z)}
            />
          </div>

          {/* RIGHT — info */}
          <div className="flex flex-col h-full overflow-y-auto bg-card">
            <div className="px-8 lg:px-10 pt-12 pb-8">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-mono">
                {wallpaper.code}
              </p>
              <h2 className="font-serif text-5xl mt-3 leading-[1.05]">{wallpaper.title}</h2>
              <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mt-4">
                {wallpaper.category}
              </p>

              <button
                onClick={visualize}
                className="mt-10 w-full bg-brand-900 text-brand-50 py-4 text-xs font-medium uppercase tracking-[0.22em] hover:bg-brand-800 transition-colors cursor-pointer"
              >
                Visualize Wallpaper →
              </button>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={editWallpaper}
                  className="flex items-center justify-center gap-2 border border-brand-900/12 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-50 transition-colors cursor-pointer"
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button
                  onClick={deleteWallpaper}
                  className="flex items-center justify-center gap-2 border border-brand-900/12 py-3 text-[11px] uppercase tracking-[0.18em] text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>

            <div className="h-px bg-brand-900/8 mx-8 lg:mx-10" />

            {/* History */}
            <div className="px-8 lg:px-10 py-8">
              <div className="flex items-end justify-between mb-1">
                <h3 className="font-serif text-2xl italic">Previous Visualizations</h3>
                {history.length > 0 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => scrollGallery(-1)}
                      className="size-8 grid place-items-center border border-brand-900/12 hover:bg-brand-50 cursor-pointer"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      onClick={() => scrollGallery(1)}
                      className="size-8 grid place-items-center border border-brand-900/12 hover:bg-brand-50 cursor-pointer"
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Rooms previously generated using this wallpaper.
              </p>

              {isLoading ? (
                <p className="text-sm text-brand-900/40">Loading history...</p>
              ) : history.length === 0 ? (
                <div className="border border-dashed border-brand-900/15 rounded-md py-10 px-6 text-center">
                  <ImageOff className="size-5 mx-auto text-brand-900/30 mb-3" />
                  <p className="text-sm text-brand-900/60 mb-5">No visualizations created yet</p>
                  <button
                    onClick={visualize}
                    className="text-[11px] uppercase tracking-[0.2em] border border-brand-900/15 px-5 py-2.5 hover:bg-brand-50 transition-colors cursor-pointer"
                  >
                    Create First Visualization
                  </button>
                </div>
              ) : (
                <div
                  id="viz-history-scroll"
                  className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => navigate({ to: "/visualizations/$id", params: { id: h.id } })}
                      className="group/thumb shrink-0 text-left cursor-pointer"
                    >
                      <div className="size-[120px] overflow-hidden rounded-md bg-brand-100">
                        <img
                          src={h.image}
                          alt={h.room}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                        />
                      </div>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-brand-900/55">
                        {h.room}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-brand-900/35">
                        {h.style} · {h.mood}
                      </p>
                      <p className="text-[10px] text-brand-900/35">{h.createdAt}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="h-px bg-brand-900/8 mx-8 lg:mx-10" />

            {/* Metadata */}
            <div className="px-8 lg:px-10 py-8 mt-auto">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Created" value="12 Mar" />
                <Stat label="Updated" value="04 Jun" />
                <Stat label="Visualizations" value={String(history.length)} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-50 px-4 py-4 rounded-md">
      <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="font-serif text-2xl mt-1.5 leading-none">{value}</p>
    </div>
  );
}
