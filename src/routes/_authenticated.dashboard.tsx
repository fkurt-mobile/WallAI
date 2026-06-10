import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { wallpapers } from "@/lib/wallpapers/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Murra" },
      { name: "description", content: "Your Murra studio overview." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              Welcome back, Anna
            </span>
            <h1 className="font-serif text-5xl md:text-6xl mt-3">Your studio.</h1>
          </div>
          <div className="flex gap-3">
            <Link
              to="/wallpapers/new"
              className="border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors"
            >
              Add Wallpaper
            </Link>
            <Link
              to="/visualizer"
              className="bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              Try Wallpaper
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-px bg-brand-900/5 mb-16">
          <Stat label="Wallpapers in catalog" value="124" />
          <Stat label="Visualizations this month" value="312" />
          <Stat label="Active mockup rooms" value="18" />
        </div>

        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-serif text-3xl italic">Recently Added</h2>
          <Link
            to="/wallpapers"
            className="text-[11px] uppercase tracking-[0.2em] text-accent hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {wallpapers.map((w) => (
            <Link key={w.id} to="/wallpapers/$id" params={{ id: w.id }} className="group">
              <img
                src={w.image}
                alt={w.title}
                className="aspect-square w-full object-cover outline-1 -outline-offset-1 outline-black/5 group-hover:outline-accent transition-all"
              />
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                {w.code}
              </p>
              <p className="text-sm font-medium">{w.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-8">
      <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">{label}</p>
      <p className="font-serif text-5xl mt-4">{value}</p>
    </div>
  );
}
