import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { wallpapers } from "@/lib/wallpapers/data";
import heroRoom from "@/assets/hero-room.jpg";
import beforeRoom from "@/assets/before-room.jpg";
import afterRoom from "@/assets/after-room.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Murra — See Any Wallpaper In Any Room" },
      {
        name: "description",
        content:
          "Premium wallpaper visualization. Upload a room photo or use staged mockups to preview wallpapers instantly.",
      },
      { property: "og:title", content: "Murra — Wallpaper Visualization" },
      {
        property: "og:description",
        content:
          "Premium wallpaper visualization for retailers, manufacturers and design showrooms.",
      },
      { property: "og:image", content: heroRoom },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-brand-50 text-brand-900">
      <SiteNav />

      {/* Hero */}
      <section className="px-6 lg:px-10 py-20 lg:py-28 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-5">
            <span className="inline-block text-accent font-medium tracking-[0.2em] uppercase text-[11px] mb-6">
              Premium Visualization SaaS
            </span>
            <h1 className="font-serif text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95] mb-8">
              See Any Wallpaper <br />
              <span className="italic">In Any Room</span>
            </h1>
            <p className="text-lg text-brand-800/70 mb-10 leading-relaxed max-w-md">
              Upload a photo of your space or use our professional mockups to instantly preview
              high-end textures in stunning detail.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/tools/wallpaper-visualizer"
                className="bg-brand-900 text-brand-50 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors shadow-xl"
              >
                Open Visualizer
              </Link>
              <Link
                to="/wallpapers"
                className="border border-brand-900/20 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] hover:bg-card transition-colors"
              >
                Browse Collections
              </Link>
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="relative">
              <img
                src={heroRoom}
                alt="Living room with botanical wallpaper preview"
                width={1280}
                height={896}
                className="w-full aspect-[4/3] object-cover shadow-2xl outline-1 -outline-offset-1 outline-black/5"
              />
              <div className="absolute -bottom-6 -left-6 bg-card p-4 shadow-lg border border-brand-900/5 max-w-[220px] flex items-center gap-3">
                <img src={wallpapers[0].image} alt="" className="size-12 object-cover" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                    Pattern
                  </p>
                  <p className="text-xs font-semibold">
                    {wallpapers[0].title} · {wallpapers[0].code}
                  </p>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 bg-gilded text-brand-50 p-4 shadow-lg max-w-[180px]">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-70 mb-1">Detected</p>
                <p className="text-xs font-semibold">Primary wall · 3.2m × 2.6m</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card border-y border-brand-900/5 py-24 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
                Process
              </span>
              <h2 className="font-serif text-4xl md:text-5xl mt-3">A three-step ritual</h2>
            </div>
            <p className="max-w-sm text-brand-900/60 text-sm leading-relaxed">
              From pattern to preview in under a minute. No measuring tape, no installer, no doubt.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-brand-900/5">
            {[
              {
                n: "01",
                t: "Choose Wallpaper",
                d: "Browse the curated catalog or your own brand collection.",
              },
              {
                n: "02",
                t: "Set The Scene",
                d: "Pick a staged mockup or upload a photo of your space.",
              },
              {
                n: "03",
                t: "Preview Result",
                d: "AI detects the wall, applies the pattern, ready to download.",
              },
            ].map((s) => (
              <div key={s.n} className="bg-card p-10 lg:p-12">
                <span className="text-[11px] font-mono text-accent tracking-[0.2em]">{s.n}</span>
                <h3 className="font-serif text-3xl italic mt-6 mb-4">{s.t}</h3>
                <p className="text-sm text-brand-900/60 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="py-28 px-6 lg:px-10 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
            Example Result
          </span>
          <h2 className="font-serif text-5xl mt-3">Before & After</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <figure>
            <img
              src={beforeRoom}
              alt="Blank room"
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
            <figcaption className="mt-4 text-[10px] uppercase tracking-[0.2em] text-brand-900/40 font-mono">
              Blank Space
            </figcaption>
          </figure>
          <figure>
            <img
              src={afterRoom}
              alt="Room visualized with Murra"
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
            <figcaption className="mt-4 text-[10px] uppercase tracking-[0.2em] text-accent font-mono">
              Murra Visualization
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-brand-900 text-brand-50 py-28 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[11px] uppercase tracking-[0.2em] text-gilded font-medium">
              Pricing
            </span>
            <h2 className="font-serif text-5xl mt-3">For every scale of studio</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-white/10">
            {[
              {
                n: "Starter",
                p: "$0",
                d: "For homeowners reimagining a single space.",
                f: ["3 visualizations / month", "Curated mockup library", "HD download"],
              },
              {
                n: "Professional",
                p: "$49",
                d: "For design studios and retail showrooms.",
                f: [
                  "Unlimited visualizations",
                  "Brand catalog upload",
                  "AI wall detection",
                  "PNG & JPG export",
                ],
                featured: true,
              },
              {
                n: "Enterprise",
                p: "Custom",
                d: "For wallpaper manufacturers, white-labeled.",
                f: [
                  "White-label visualizer",
                  "API access",
                  "Custom mockup studio",
                  "Dedicated support",
                ],
              },
            ].map((t) => (
              <div
                key={t.n}
                className={
                  "bg-brand-900 p-10 lg:p-12 flex flex-col " +
                  (t.featured ? "ring-1 ring-gilded relative" : "")
                }
              >
                {t.featured && (
                  <span className="absolute top-6 right-6 text-[9px] uppercase tracking-[0.2em] text-gilded">
                    Most popular
                  </span>
                )}
                <h3 className="font-serif text-3xl italic mb-2">{t.n}</h3>
                <p className="text-sm text-brand-50/50 mb-8 leading-relaxed">{t.d}</p>
                <div className="font-serif text-5xl mb-8">
                  {t.p}
                  {t.p.startsWith("$") && t.p !== "$0" ? (
                    <span className="text-base text-brand-50/40">/mo</span>
                  ) : null}
                </div>
                <ul className="space-y-3 mb-10 flex-1">
                  {t.f.map((feat) => (
                    <li key={feat} className="text-sm text-brand-50/70 flex items-center gap-3">
                      <span className="size-1 rounded-full bg-gilded" /> {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth"
                  className={
                    "text-center py-3 text-[11px] uppercase tracking-[0.2em] font-medium transition-colors " +
                    (t.featured
                      ? "bg-gilded text-brand-900 hover:opacity-90"
                      : "border border-white/20 hover:bg-white/5")
                  }
                >
                  {t.p === "Custom" ? "Contact Sales" : "Get Started"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
