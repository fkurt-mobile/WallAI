import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SharePanel } from "./share-panel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { formatShortDate } from "@/lib/dates";

export interface VizPreview {
  id: string;
  image: string;
  room: string;
  wallpaperTitle?: string;
  style?: string | null;
  mood?: string | null;
  createdAt?: string | null;
  activityEntityId?: string | null;
  activityEntityType?: "visualization" | "ai_generation";
}

export function VisualizationPreviewModal({
  viz,
  visualizations,
  currentIndex,
  onSelectIndex,
  open,
  onOpenChange,
}: {
  viz: VizPreview | null;
  visualizations?: VizPreview[];
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const items = visualizations?.length ? visualizations : viz ? [viz] : [];
  const selectedIndex =
    typeof currentIndex === "number" && currentIndex >= 0 && currentIndex < items.length
      ? currentIndex
      : viz
        ? Math.max(
            0,
            items.findIndex((item) => item.id === viz.id),
          )
        : 0;
  const active = items[selectedIndex] || viz;
  const canNavigate = items.length > 1;

  const selectRelative = useCallback(
    (direction: -1 | 1) => {
      if (!canNavigate || !onSelectIndex) return;
      onSelectIndex((selectedIndex + direction + items.length) % items.length);
    },
    [canNavigate, items.length, onSelectIndex, selectedIndex],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectRelative(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectRelative(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, selectRelative]);

  if (!active) return null;

  const createdDate = formatShortDate(active.createdAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 bg-brand-50 sm:rounded-lg overflow-hidden shadow-2xl"
        style={{ width: "85vw", maxWidth: "85vw", height: "85vh" }}
      >
        <DialogTitle className="sr-only">{active.room} visualization</DialogTitle>
        <DialogDescription className="sr-only">
          Preview of generated visualization for {active.room}.
        </DialogDescription>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] h-full">
          <div className="relative min-h-0 bg-brand-100 overflow-hidden">
            {canNavigate && (
              <>
                <button
                  type="button"
                  onClick={() => selectRelative(-1)}
                  aria-label="Previous visualization"
                  className="absolute left-5 top-1/2 z-20 size-11 -translate-y-1/2 grid place-items-center rounded-full bg-card/90 backdrop-blur hover:bg-card transition-colors"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => selectRelative(1)}
                  aria-label="Next visualization"
                  className="absolute right-5 top-1/2 z-20 size-11 -translate-y-1/2 grid place-items-center rounded-full bg-card/90 backdrop-blur hover:bg-card transition-colors"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            <div className="absolute inset-8 lg:inset-12 flex items-center justify-center">
              <img
                src={active.image}
                alt={active.room}
                className="block h-full w-full object-contain rounded-md shadow-xl"
              />
            </div>
            <div className="absolute top-6 left-6 bg-card/95 backdrop-blur px-4 py-2 border border-white/30">
              <p className="text-[9px] uppercase tracking-[0.22em] text-brand-900/45">
                {items.length ? `${selectedIndex + 1} of ${items.length}` : "Preview"}
              </p>
              <p className="text-sm font-medium">{active.room}</p>
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto bg-brand-50 border-l border-brand-900/8 p-5 lg:p-6 pb-7">
            <div className="bg-card border border-brand-900/8 p-5 lg:p-6 mb-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium">
                Details
              </p>
              <h3 className="font-serif text-2xl italic mt-2 mb-5">
                {active.wallpaperTitle || "Visualization"}
              </h3>
              <div className="space-y-2.5">
                <DetailRow label="Room Type" value={active.room || "Room"} />
                <DetailRow label="Style" value={active.style || "Style"} />
                <DetailRow label="Mood" value={active.mood || "Mood"} />
                <DetailRow label="Created" value={createdDate} />
              </div>
            </div>
            <SharePanel
              title="Share Visualization"
              shareUrl={active.image}
              compact
              activityEntityId={active.activityEntityId || active.id}
              activityEntityType={active.activityEntityType || "visualization"}
              activityMetadata={{
                visualization_id:
                  active.activityEntityType === "visualization"
                    ? active.activityEntityId || active.id
                    : null,
                wallpaper_name: active.wallpaperTitle || null,
                room_type: active.room || null,
                thumbnail_url: active.image,
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] uppercase tracking-[0.18em] text-brand-900/40">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
