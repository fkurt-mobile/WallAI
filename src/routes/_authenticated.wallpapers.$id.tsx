import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/wallpapers/$id")({
  loader: async ({ params }) => {
    const { data: wallpaper, error } = await supabase
      .from("wallpapers")
      .select("*")
      .eq("id", params.id)
      .single();
    if (error || !wallpaper) throw notFound();
    return { wallpaper };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.wallpaper.title} — Murra` },
          {
            name: "description",
            content: `${loaderData.wallpaper.title} (${loaderData.wallpaper.product_code}) — ${loaderData.wallpaper.category} wallpaper.`,
          },
          { property: "og:image", content: loaderData.wallpaper.image_url },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center font-serif text-3xl italic">
      Wallpaper not found.
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
      {error.message}
    </div>
  ),
  component: WallpaperDetail,
});

function WallpaperDetail() {
  const { wallpaper } = Route.useLoaderData();

  // Fetch related wallpapers of same category from Supabase
  const { data: related = [] } = useQuery({
    queryKey: ["related-wallpapers", wallpaper.category, wallpaper.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("category", wallpaper.category)
        .neq("id", wallpaper.id)
        .limit(4);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/wallpapers"
          className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent"
        >
          ← Back to collection
        </Link>

        <div className="grid lg:grid-cols-12 gap-12 mt-10">
          <div className="lg:col-span-7">
            <img
              src={wallpaper.image_url}
              alt={wallpaper.title}
              className="w-full aspect-square object-cover shadow-2xl"
            />
          </div>
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              {wallpaper.category}
            </span>
            <h1 className="font-serif text-6xl mt-3 mb-6">{wallpaper.title}</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 font-mono mb-10">
              SKU · {wallpaper.product_code}
            </p>
            <p className="text-base text-brand-800/70 leading-relaxed mb-10 max-w-md">
              A {wallpaper.category.toLowerCase()} treatment with a quiet hand-drawn quality. Best
              paired with neutral linen, oak, and warm side light.
            </p>
            <Link
              to="/tools/wallpaper-visualizer"
              search={{ wallpaper: wallpaper.id }}
              className="bg-brand-900 text-brand-50 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors text-center"
            >
              Try In Room →
            </Link>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-24">
            <h2 className="font-serif text-3xl italic mb-6">From the same collection</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {related.map((w) => (
                <Link key={w.id} to="/wallpapers/$id" params={{ id: w.id }} className="group">
                  <img
                    src={w.image_url}
                    alt={w.title}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                    {w.product_code}
                  </p>
                  <p className="text-sm font-medium">{w.title}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
