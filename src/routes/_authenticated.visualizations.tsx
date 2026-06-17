import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import {
  VisualizationPreviewModal,
  type VizPreview,
} from "@/components/site/visualization-preview-modal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Check, Facebook, Instagram, Link as LinkIcon, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visualizations")({
  head: () => ({
    meta: [
      { title: "Visualizations — Murra" },
      { name: "description", content: "Browse all previously generated wallpaper mockups." },
    ],
  }),
  component: VisualizationsPage,
});

interface VisualizationRow {
  id: string;
  wallpaper_id: string | null;
  result_image_url: string;
  room_type: string | null;
  style?: string | null;
  mood?: string | null;
  created_at: string;
  wallpapers?: {
    title?: string | null;
  } | null;
}

interface AiGenerationRow {
  id: string;
  wallpaper_id: string | null;
  room_type: string | null;
  style?: string | null;
  mood?: string | null;
  created_at: string;
  variation_1_url?: string | null;
  variation_2_url?: string | null;
  variation_3_url?: string | null;
  variation_4_url?: string | null;
}

interface AiGenerationsClient {
  from: (table: "ai_generations") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: AiGenerationRow[] | null; error: { message?: string } | null }>;
      };
    };
  };
}

type VisualizationCard = VizPreview & {
  wallpaperId?: string | null;
  wallpaperTitle: string;
  date: string;
};

function VisualizationsPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;

  const copyShareLink = async (viz: VisualizationCard) => {
    try {
      await navigator.clipboard.writeText(viz.image);
      setCopiedId(viz.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      window.open(viz.image, "_blank");
    }
  };

  // Query real visualizations from Supabase
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["visualizations", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("visualizations")
        .select("*, wallpapers(title)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mappedVisualizations: VisualizationCard[] = (data as VisualizationRow[]).map((v) => ({
        id: v.id,
        wallpaperId: v.wallpaper_id,
        wallpaperTitle: v.wallpapers?.title || "Deleted Wallpaper",
        room: v.room_type || "Room",
        style: v.style || null,
        mood: v.mood || null,
        createdAt: v.created_at,
        date: new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        image: v.result_image_url,
      }));

      const seenUrls = new Set(mappedVisualizations.map((v) => v.image));
      let mappedAiGenerations: VisualizationCard[] = [];

      try {
        const aiGenerationsClient = supabase as unknown as AiGenerationsClient;
        const { data: aiGenerations, error: aiError } = await aiGenerationsClient
          .from("ai_generations")
          .select("*")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false });

        if (!aiError && aiGenerations) {
          mappedAiGenerations = aiGenerations.flatMap((generation) =>
            [
              generation.variation_1_url,
              generation.variation_2_url,
              generation.variation_3_url,
              generation.variation_4_url,
            ]
              .filter((url): url is string => typeof url === "string" && url.length > 0)
              .flatMap((url, index) => {
                if (seenUrls.has(url)) return [];
                seenUrls.add(url);
                return [
                  {
                    id: `${generation.id}-${index}`,
                    wallpaperId: generation.wallpaper_id,
                    wallpaperTitle: "AI Room Design",
                    room: generation.room_type || "Room",
                    style: generation.style || null,
                    mood: generation.mood || null,
                    createdAt: generation.created_at,
                    date: new Date(generation.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }),
                    image: url,
                  },
                ];
              }),
          );
        }
      } catch {
        // Older projects may not have the ai_generations table.
      }

      return [...mappedVisualizations, ...mappedAiGenerations].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
    },
    enabled: !!companyId,
  });

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
            {isLoading ? "..." : list.length} total
          </p>
        </div>

        {isLoading ? (
          <p className="text-center font-serif text-2xl italic py-20">Loading visualizations...</p>
        ) : list.length === 0 ? (
          <div className="border border-dashed border-brand-900/15 bg-card py-24 px-8 text-center max-w-xl mx-auto">
            <h2 className="font-serif text-3xl italic mb-3">No AI designs yet</h2>
            <p className="text-brand-900/55 mb-8">
              Use the AI Room Designer to generate photorealistic interior visualizations with your
              wallpapers.
            </p>
            <Link
              to="/tools/wallpaper-visualizer"
              className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              ✨ Open AI Room Designer
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {list.map((v, index) => (
              <article
                key={v.id}
                className="relative bg-card border border-brand-900/8 flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className="group/image aspect-[4/3] overflow-hidden bg-brand-100 cursor-pointer"
                  aria-label={`Preview ${v.wallpaperTitle}`}
                >
                  <img
                    src={v.image}
                    alt={v.wallpaperTitle}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-105"
                  />
                </button>
                <div className="p-6 flex-1 flex flex-col">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                    {v.room}
                  </p>
                  <h3 className="font-serif text-2xl italic mt-2">{v.wallpaperTitle}</h3>
                  <p className="text-xs text-brand-900/50 mt-1">Created {v.date}</p>
                  <div className="mt-5 flex gap-2 relative">
                    <button
                      onClick={() => {
                        setShareOpenId(null);
                        setActiveIndex(index);
                      }}
                      className="flex-1 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
                    >
                      View →
                    </button>
                    <button
                      onClick={() => setShareOpenId((current) => (current === v.id ? null : v.id))}
                      aria-expanded={shareOpenId === v.id}
                      className="border border-brand-900/12 px-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-50 transition-colors cursor-pointer"
                    >
                      Share
                    </button>
                    {shareOpenId === v.id && (
                      <VisualizationSharePopover
                        viz={v}
                        copied={copiedId === v.id}
                        onCopy={() => copyShareLink(v)}
                        onClose={() => setShareOpenId(null)}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <VisualizationPreviewModal
        viz={activeIndex === null ? null : list[activeIndex]}
        visualizations={list}
        currentIndex={activeIndex ?? 0}
        onSelectIndex={setActiveIndex}
        open={activeIndex !== null}
        onOpenChange={(o) => !o && setActiveIndex(null)}
      />
    </AppShell>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 5 3.1 9.3 7.5 11-.1-.9-.2-2.4 0-3.4.2-.9 1.4-5.7 1.4-5.7s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.5 2.6-5.5 5.3 0 1 .4 2.2.9 2.8.1.1.1.2.1.3-.1.4-.3 1.2-.3 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.4 8-7.4 4.2 0 7.4 3 7.4 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1-1 2.3-1.5 3.1.4.1.9.2 1.4.2 6.6 0 12-5.4 12-12S18.6 0 12 0Z" />
    </svg>
  );
}

function VisualizationSharePopover({
  viz,
  copied,
  onCopy,
  onClose,
}: {
  viz: VisualizationCard;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const options = [
    {
      name: "Email",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent("Wallpaper visualization")}&body=${encodeURIComponent(viz.image)}`,
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(viz.image)}`,
    },
    {
      name: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(viz.image)}`,
    },
    {
      name: "Instagram",
      icon: Instagram,
      href: "https://www.instagram.com/",
    },
    {
      name: "Pinterest",
      icon: PinterestIcon,
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(viz.image)}`,
    },
  ];

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-52 border border-brand-900/10 bg-card p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
      <p className="px-3 py-2 text-[9px] uppercase tracking-[0.2em] text-accent">Share</p>
      <div className="space-y-1">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <a
              key={option.name}
              href={option.href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 text-xs uppercase tracking-[0.16em] text-brand-900/65 hover:bg-brand-50 hover:text-brand-900 transition-colors"
            >
              <Icon className="size-4 text-brand-900/50" />
              {option.name}
            </a>
          );
        })}
        <button
          type="button"
          onClick={onCopy}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-xs uppercase tracking-[0.16em] text-brand-900/65 hover:bg-brand-50 hover:text-brand-900 transition-colors cursor-pointer"
        >
          {copied ? (
            <Check className="size-4 text-accent" />
          ) : (
            <LinkIcon className="size-4 text-brand-900/50" />
          )}
          {copied ? "Copied" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
