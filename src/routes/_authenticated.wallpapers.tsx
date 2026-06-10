import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { wallpapers, categories, type Wallpaper } from "@/lib/wallpapers/data";
import { WallpaperModal } from "@/components/site/wallpaper-modal";
import { Plus, Eye, Pencil, Trash2, ImagePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallpapers")({
  head: () => ({
    meta: [
      { title: "Wallpapers — Murra" },
      { name: "description", content: "Browse the curated wallpaper catalog." },
    ],
  }),
  component: WallpaperList,
});

function WallpaperList() {
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Wallpaper | null>(null);
  const filtered = wallpapers.filter(
    (w) =>
      (cat === "All" || w.category === cat) &&
      (query === "" ||
        w.title.toLowerCase().includes(query.toLowerCase()) ||
        w.code.toLowerCase().includes(query.toLowerCase())),
  );
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

        {wallpapers.length === 0 ? (
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
                  <CardAction label="Edit" to="/wallpapers/new">
                    <Pencil className="size-3.5" />
                  </CardAction>
                  <CardAction
                    label="Delete"
                    onClick={() => {
                      /* delete hook */
                    }}
                    danger
                  >
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
      />
    </AppShell>
  );
}

function CardAction({
  children,
  label,
  onClick,
  to,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
}) {
  const cls =
    "size-8 grid place-items-center bg-card/95 backdrop-blur border border-brand-900/10 shadow-sm transition-colors cursor-pointer " +
    (danger
      ? "hover:bg-destructive hover:text-destructive-foreground"
      : "hover:bg-accent hover:text-accent-foreground");
  if (to) {
    return (
      <Link to={to} title={label} aria-label={label} className={cls}>
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
