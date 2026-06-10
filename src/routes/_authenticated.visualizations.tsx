import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { visualizations } from "@/lib/wallpapers/data";
import {
  VisualizationPreviewModal,
  type VizPreview,
} from "@/components/site/visualization-preview-modal";

export const Route = createFileRoute("/_authenticated/visualizations")({
  head: () => ({
    meta: [
      { title: "Visualizations — Murra" },
      { name: "description", content: "Browse all previously generated wallpaper mockups." },
    ],
  }),
  component: VisualizationsPage,
});

function VisualizationsPage() {
  const [active, setActive] = useState<VizPreview | null>(null);
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              Library
            </span>
            <h1 className="font-serif text-5xl md:text-6xl mt-3">Visualizations.</h1>
            <p className="text-brand-900/55 mt-3 max-w-md">
              Every wallpaper mockup you've generated, in one place.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-900/45">
            {visualizations.length} total
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {visualizations.map((v) => (
            <article
              key={v.id}
              className="bg-card border border-brand-900/8 overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] overflow-hidden bg-brand-100">
                <img
                  src={v.image}
                  alt={v.wallpaperTitle}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                  {v.room}
                </p>
                <h3 className="font-serif text-2xl italic mt-2">{v.wallpaperTitle}</h3>
                <p className="text-xs text-brand-900/50 mt-1">Created {v.date}</p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setActive(v)}
                    className="flex-1 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
                  >
                    View →
                  </button>
                  <button
                    onClick={() => setActive(v)}
                    className="border border-brand-900/12 px-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-50 transition-colors cursor-pointer"
                  >
                    Share
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <VisualizationPreviewModal
        viz={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
      />
    </AppShell>
  );
}
