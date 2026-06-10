import type { Wallpaper } from "@/lib/wallpapers/data";

export function StickySelected({ wallpaper }: { wallpaper: Wallpaper }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-brand-900 text-brand-50 shadow-2xl border border-white/10 flex items-center gap-4 pl-2 pr-5 py-2">
      <img src={wallpaper.image} alt={wallpaper.title} className="size-10 object-cover" />
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-[0.2em] text-brand-50/50">Selected</span>
        <span className="text-xs font-medium">
          {wallpaper.title} · {wallpaper.code}
        </span>
      </div>
    </div>
  );
}
