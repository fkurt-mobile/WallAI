import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SharePanel } from "./share-panel";

export interface VizPreview {
  id: string;
  image: string;
  room: string;
  wallpaperTitle?: string;
}

export function VisualizationPreviewModal({
  viz,
  open,
  onOpenChange,
}: {
  viz: VizPreview | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!viz) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 bg-brand-50 sm:rounded-lg overflow-hidden shadow-2xl"
        style={{ width: "85vw", maxWidth: "85vw", height: "85vh" }}
      >
        <DialogTitle className="sr-only">{viz.room} visualization</DialogTitle>
        <DialogDescription className="sr-only">
          Preview of generated visualization for {viz.room}.
        </DialogDescription>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] h-full">
          <div className="relative bg-brand-100 flex items-center justify-center p-8 lg:p-12 overflow-hidden">
            <img
              src={viz.image}
              alt={viz.room}
              className="max-w-full max-h-full object-contain rounded-md shadow-xl"
            />
            <div className="absolute top-6 left-6 bg-card/95 backdrop-blur px-4 py-2 border border-white/30">
              <p className="text-[9px] uppercase tracking-[0.22em] text-brand-900/45">Room</p>
              <p className="text-sm font-medium">{viz.room}</p>
            </div>
          </div>
          <div className="overflow-y-auto bg-brand-50 p-6 lg:p-8 border-l border-brand-900/8">
            <SharePanel title="Share Visualization" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
