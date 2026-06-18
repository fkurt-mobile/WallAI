import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/site/app-shell";
import { type Wallpaper } from "@/lib/wallpapers/data";
import {
  Sparkles,
  ChevronLeft,
  Download,
  Plus,
  Check,
  Loader2,
  Mail,
  MessageCircle,
  Facebook,
  Instagram,
  Link as LinkIcon,
  Home,
  BedDouble,
  Briefcase,
  UtensilsCrossed,
  Coffee,
  ShoppingBag,
  DoorOpen,
  Hotel,
  Building2,
  Waypoints,
  RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { logActivityEvent } from "@/lib/activity-client";

const searchSchema = z.object({
  wallpaper: z.string().optional(),
  wallpaper_id: z.string().optional(),
  room_type: z.string().optional(),
  roomType: z.string().optional(),
  style: z.string().optional(),
  mood: z.string().optional(),
  custom_prompt: z.string().optional(),
  customPrompt: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/tools/wallpaper-visualizer")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "✨ AI Room Designer — Murra" },
      {
        name: "description",
        content:
          "Select a wallpaper and let AI generate a complete photorealistic interior design around it.",
      },
    ],
  }),
  component: AiRoomDesigner,
});

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = "wallpaper" | "room-type" | "style" | "mood" | "instructions" | "generating" | "result";

interface DesignState {
  wallpaper: Wallpaper | null;
  roomType: string;
  style: string;
  mood: string;
  customPrompt: string;
  variationCount: number;
}

interface GenerationResult {
  id: string | null;
  variation_1_url?: string | null;
  variation_2_url?: string | null;
  variation_3_url?: string | null;
  variation_4_url?: string | null;
  visualizations?: Array<{
    id?: string | null;
    result_image_url?: string | null;
    preview_image_url?: string | null;
  }>;
}

interface GeneratedImage {
  id: string;
  url: string;
  visualizationId?: string | null;
}

// ── Option Data ────────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  { value: "Living Room", label: "Living Room", icon: Home },
  { value: "Bedroom", label: "Bedroom", icon: BedDouble },
  { value: "Office", label: "Office", icon: Briefcase },
  { value: "Dining Room", label: "Dining Room", icon: UtensilsCrossed },
  { value: "Cafe", label: "Cafe", icon: Coffee },
  { value: "Restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { value: "Hotel Suite", label: "Hotel Suite", icon: Hotel },
  { value: "Retail Store", label: "Retail Store", icon: ShoppingBag },
  { value: "Reception Area", label: "Reception Area", icon: Building2 },
  { value: "Hallway", label: "Hallway", icon: Waypoints },
];

const STYLES = [
  { value: "Scandinavian", label: "Scandinavian", desc: "Clean, minimal, light wood" },
  { value: "Minimalist", label: "Minimalist", desc: "Stripped back, functional" },
  { value: "Japandi", label: "Japandi", desc: "Japanese-Scandi fusion" },
  { value: "Modern Luxury", label: "Modern Luxury", desc: "Sleek, high-end materials" },
  { value: "Contemporary", label: "Contemporary", desc: "Current trends, balanced" },
  { value: "Industrial", label: "Industrial", desc: "Raw, exposed, urban" },
  { value: "Mediterranean", label: "Mediterranean", desc: "Warm, textured, earthy" },
  { value: "Boutique Hotel", label: "Boutique Hotel", desc: "Curated, distinctive" },
  { value: "Organic Modern", label: "Organic Modern", desc: "Natural forms, biophilic" },
  { value: "Classic Luxury", label: "Classic Luxury", desc: "Timeless, opulent" },
];

const MOODS = [
  { value: "Bright & Airy", label: "Bright & Airy", color: "from-sky-50 to-indigo-50" },
  { value: "Cozy & Warm", label: "Cozy & Warm", color: "from-amber-50 to-orange-50" },
  { value: "Elegant", label: "Elegant", color: "from-stone-50 to-zinc-100" },
  { value: "Premium Luxury", label: "Premium Luxury", color: "from-yellow-50 to-amber-100" },
  { value: "Natural", label: "Natural", color: "from-green-50 to-emerald-50" },
  { value: "Creative", label: "Creative", color: "from-violet-50 to-purple-50" },
  { value: "Sophisticated", label: "Sophisticated", color: "from-slate-50 to-gray-100" },
  { value: "Calm & Relaxing", label: "Calm & Relaxing", color: "from-teal-50 to-cyan-50" },
];

const GENERATING_MESSAGES = [
  "Analyzing wallpaper pattern…",
  "Selecting matching furniture…",
  "Designing room composition…",
  "Applying materials and lighting…",
  "Rendering visualization…",
];

const PROMPT_EXAMPLES = [
  "Large windows",
  "Indoor plants",
  "Ocean view",
  "Luxury penthouse",
  "Dark wood furniture",
  "Gold accents",
  "High ceilings",
  "Marble floors",
];

const VARIATION_COUNT_OPTIONS = [1, 2, 3, 4];

// ── Main Component ─────────────────────────────────────────────────────────────

function AiRoomDesigner() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;

  const [step, setStep] = useState<Step>("wallpaper");
  const [design, setDesign] = useState<DesignState>({
    wallpaper: null,
    roomType: "",
    style: "",
    mood: "",
    customPrompt: "",
    variationCount: 2,
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Fetch wallpapers ────────────────────────────────────────────────────────
  const { data: dbWallpapers = [], isLoading: wallpapersLoading } = useQuery({
    queryKey: ["wallpapers", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("user_id", profile.id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const wallpapersList: Wallpaper[] = useMemo(
    () =>
      dbWallpapers.map((w) => ({
        id: w.id,
        code: w.product_code,
        title: w.title,
        category: w.category,
        image: w.image_url,
        tint: "",
      })),
    [dbWallpapers],
  );

  // ── Load wallpaper from query param and prefill ────────────────────────────
  useEffect(() => {
    const wpId = search.wallpaper_id || search.wallpaper;
    const rt = search.room_type || search.roomType;
    if (wpId && wallpapersList.length > 0) {
      const selected = wallpapersList.find((w) => w.id === wpId);
      if (selected) {
        setDesign((d) => ({
          ...d,
          wallpaper: selected,
          roomType: rt || d.roomType,
          style: search.style || d.style,
          mood: search.mood || d.mood,
          customPrompt: search.custom_prompt || search.customPrompt || d.customPrompt,
        }));

        if (rt && search.style && search.mood) {
          setStep("instructions");
        } else {
          setStep("room-type");
        }
      }
    }
  }, [
    search.wallpaper,
    search.wallpaper_id,
    search.room_type,
    search.roomType,
    search.style,
    search.mood,
    search.custom_prompt,
    search.customPrompt,
    wallpapersList,
  ]);

  // ── Auth helper ────────────────────────────────────────────────────────────
  const getToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("No active session. Please log in.");
    return token;
  };

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!design.wallpaper || !design.roomType || !design.style || !design.mood) {
      toast.error("Please complete all required steps first.");
      return;
    }
    if (!companyId || !profile?.id) {
      toast.error("You must be logged in.");
      return;
    }

    const isAppending = step === "result" && generatedImages.length > 0;
    if (!isAppending) {
      setStep("generating");
      setResult(null);
      setGeneratedImages([]);
      setSelectedImageId(null);
    }
    setGenerating(true);
    setGenError(null);

    try {
      const token = await getToken();
      const response = await fetch("/api/ai/generate-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          wallpaperId: design.wallpaper.id,
          roomType: design.roomType,
          style: design.style,
          mood: design.mood,
          customPrompt: design.customPrompt || undefined,
          variationCount: design.variationCount,
          isRegeneration: isAppending,
        }),
      });

      if (!response.ok) {
        let errMsg = "AI generation failed. Please try again.";
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          // Keep the generic message when the error body is not JSON.
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const nextImages = extractGeneratedImages(data);
      setResult(data);
      setGeneratedImages((current) => {
        const seen = new Set(current.map((image) => image.visualizationId || image.url));
        const merged = [...current];
        nextImages.forEach((image) => {
          const dedupeKey = image.visualizationId || image.url;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            merged.push(image);
          }
        });
        return merged;
      });
      if (nextImages[0]) {
        const firstNewImage = nextImages[0];
        const existingImage = generatedImages.find(
          (image) =>
            image.url === firstNewImage.url ||
            (image.visualizationId && image.visualizationId === firstNewImage.visualizationId),
        );
        setSelectedImageId(existingImage?.id || firstNewImage.id);
      }
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["ai-generations"] });
      queryClient.invalidateQueries({ queryKey: ["visualizations"] });
      queryClient.invalidateQueries({
        queryKey: ["wallpaper-visualizations", design.wallpaper.id],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard-activity"] });
      toast.success("Your AI room designs are ready!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed. Please try again.";
      setGenError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const resetAll = () => {
    setDesign({
      wallpaper: null,
      roomType: "",
      style: "",
      mood: "",
      customPrompt: "",
      variationCount: 2,
    });
    setResult(null);
    setGeneratedImages([]);
    setSelectedImageId(null);
    setGenError(null);
    setStep("wallpaper");
  };

  // ── Step number for header stepper ────────────────────────────────────────
  const stepNum =
    step === "wallpaper"
      ? 1
      : step === "room-type"
        ? 2
        : step === "style"
          ? 3
          : step === "mood"
            ? 4
            : step === "instructions"
              ? 5
              : 5;

  return (
    <AppShell contentClassName="pb-32">
      {/* ── Top bar with stepper ── */}
      {step !== "generating" && (
        <div className="border-b border-brand-900/5 bg-card sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-6">
            <AiDesignerStepper current={stepNum} />
            <Link
              to="/wallpapers"
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent shrink-0"
            >
              ✕ Exit
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        {/* ── Step 1: Select Wallpaper ── */}
        {step === "wallpaper" && (
          <SelectWallpaper
            wallpapers={wallpapersList}
            isLoading={wallpapersLoading}
            onPick={(w) => {
              setDesign((d) => ({ ...d, wallpaper: w }));
              setStep("room-type");
            }}
          />
        )}

        {/* ── Step 2: Room Type ── */}
        {step === "room-type" && design.wallpaper && (
          <RoomTypeStep
            selected={design.roomType}
            onSelect={(v) => setDesign((d) => ({ ...d, roomType: v }))}
            onContinue={() => setStep("style")}
            onBack={() => setStep("wallpaper")}
          />
        )}

        {/* ── Step 3: Style ── */}
        {step === "style" && (
          <StyleStep
            selected={design.style}
            onSelect={(v) => setDesign((d) => ({ ...d, style: v }))}
            onContinue={() => setStep("mood")}
            onBack={() => setStep("room-type")}
          />
        )}

        {/* ── Step 4: Mood ── */}
        {step === "mood" && (
          <MoodStep
            selected={design.mood}
            onSelect={(v) => setDesign((d) => ({ ...d, mood: v }))}
            onContinue={() => setStep("instructions")}
            onBack={() => setStep("style")}
          />
        )}

        {/* ── Step 5: Instructions ── */}
        {step === "instructions" && (
          <InstructionsStep
            value={design.customPrompt}
            onChange={(v) => setDesign((d) => ({ ...d, customPrompt: v }))}
            wallpaper={design.wallpaper!}
            roomType={design.roomType}
            style={design.style}
            mood={design.mood}
            variationCount={design.variationCount}
            onVariationCountChange={(count) => setDesign((d) => ({ ...d, variationCount: count }))}
            onGenerate={handleGenerate}
            onBack={() => setStep("mood")}
          />
        )}

        {/* ── Generating Screen ── */}
        {step === "generating" && (
          <GeneratingScreen
            wallpaper={design.wallpaper!}
            variationCount={design.variationCount}
            error={genError}
            onRetry={handleGenerate}
            onBack={() => {
              setGenError(null);
              setStep("instructions");
            }}
          />
        )}

        {/* ── Result Gallery ── */}
        {step === "result" && result && design.wallpaper && generatedImages.length > 0 && (
          <ResultGallery
            generationId={result.id}
            wallpaper={design.wallpaper}
            roomType={design.roomType}
            style={design.style}
            mood={design.mood}
            generatedImages={generatedImages}
            selectedImageId={selectedImageId}
            onSelectImage={setSelectedImageId}
            onGenerateMore={handleGenerate}
            onCreateNew={resetAll}
            generating={generating}
            variationCount={design.variationCount}
          />
        )}
      </div>

      {/* ── Sticky wallpaper bar ── */}
      {design.wallpaper && step !== "wallpaper" && step !== "generating" && step !== "result" && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-brand-900/8 bg-card/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center gap-4">
            <img
              src={design.wallpaper.image}
              alt={design.wallpaper.title}
              className="size-12 object-cover shrink-0 outline-1 -outline-offset-1 outline-black/10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                Selected Wallpaper
              </p>
              <p className="text-sm font-medium truncate">{design.wallpaper.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep("wallpaper")}
              className="text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent transition-colors shrink-0"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function extractGeneratedImages(data: GenerationResult): GeneratedImage[] {
  const fromRecords: GeneratedImage[] =
    data.visualizations?.flatMap((visualization, index) => {
      const url = visualization.preview_image_url || visualization.result_image_url;
      if (!url) return [];
      return [
        {
          id: visualization.id || `${data.id || "generation"}-${index}-${url}`,
          url,
          visualizationId: visualization.id || null,
        },
      ];
    }) || [];

  if (fromRecords.length > 0) return fromRecords;

  return [data.variation_1_url, data.variation_2_url, data.variation_3_url, data.variation_4_url]
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url, index) => ({
      id: `${data.id || "generation"}-${index}-${url}`,
      url,
      visualizationId: null,
    }));
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function AiDesignerStepper({ current }: { current: number }) {
  const steps = ["Wallpaper", "Room Type", "Style", "Mood", "Generate"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={
                  "size-6 rounded-full grid place-items-center text-[10px] font-bold transition-colors " +
                  (done
                    ? "bg-accent text-brand-950"
                    : active
                      ? "bg-brand-900 text-brand-50"
                      : "bg-brand-900/10 text-brand-900/40")
                }
              >
                {done ? <Check className="size-3" /> : num}
              </div>
              <span
                className={
                  "text-[11px] uppercase tracking-[0.16em] hidden sm:block " +
                  (active ? "text-brand-900 font-semibold" : "text-brand-900/40")
                }
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={"w-6 h-px mx-2 " + (done ? "bg-accent" : "bg-brand-900/15")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Select Wallpaper ───────────────────────────────────────────────────

function SelectWallpaper({
  wallpapers,
  isLoading,
  onPick,
}: {
  wallpapers: Wallpaper[];
  isLoading: boolean;
  onPick: (w: Wallpaper) => void;
}) {
  return (
    <section>
      <Eyebrow>Step 1 of 5</Eyebrow>
      <Heading>Choose a wallpaper.</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        Pick any pattern from your catalog — AI will build an entire room around it.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-accent" />
        </div>
      ) : wallpapers.length === 0 ? (
        <div className="border border-dashed border-brand-900/15 bg-card py-16 px-8 text-center max-w-xl">
          <Sparkles className="size-10 text-accent/40 mx-auto mb-4" />
          <p className="text-brand-900/50 font-serif text-xl italic mb-4">
            No wallpapers in your catalog yet
          </p>
          <Link
            to="/wallpapers/new"
            className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
          >
            Upload Your First Wallpaper
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {wallpapers.map((w) => (
            <button
              key={w.id}
              id={`wallpaper-${w.id}`}
              onClick={() => onPick(w)}
              className="group block text-left cursor-pointer"
            >
              <div className="aspect-square overflow-hidden bg-brand-100 relative">
                <img
                  src={w.image}
                  alt={w.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-brand-950/0 group-hover:bg-brand-950/20 transition-colors duration-300 flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-card/95 backdrop-blur-sm px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold flex items-center gap-1.5">
                    <Sparkles className="size-3 text-accent" /> Select
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                {w.code}
              </p>
              <p className="text-sm font-medium">{w.title}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Step 2: Room Type ──────────────────────────────────────────────────────────

function RoomTypeStep({
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  selected: string;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step 2 of 5</Eyebrow>
      <Heading>Where will this wallpaper be used?</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        Choose the room type. The AI will design the space accordingly.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        {ROOM_TYPES.map(({ value, label, icon: Icon }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              id={`room-type-${value.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => onSelect(value)}
              className={
                "group relative p-6 border text-left transition-all duration-200 cursor-pointer flex flex-col items-start gap-3 " +
                (active
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-brand-900/8 bg-card hover:border-accent/50 hover:bg-accent/2")
              }
            >
              {active && (
                <span className="absolute top-3 right-3 size-4 rounded-full bg-accent grid place-items-center">
                  <Check className="size-2.5 text-brand-950" />
                </span>
              )}
              <Icon
                className={
                  "size-6 transition-colors " +
                  (active ? "text-accent" : "text-brand-900/40 group-hover:text-accent/70")
                }
              />
              <span className="text-sm font-medium leading-snug">{label}</span>
            </button>
          );
        })}
      </div>

      <StepActions
        onContinue={onContinue}
        canContinue={!!selected}
        onBack={onBack}
        continueLabel="Continue →"
      />
    </section>
  );
}

// ── Step 3: Style ──────────────────────────────────────────────────────────────

function StyleStep({
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  selected: string;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step 3 of 5</Eyebrow>
      <Heading>Choose a design style.</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        The AI will match furniture, materials, and layout to this aesthetic.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
        {STYLES.map(({ value, label, desc }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              id={`style-${value.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => onSelect(value)}
              className={
                "group relative p-6 border text-left transition-all duration-200 cursor-pointer flex flex-col gap-2 " +
                (active
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-brand-900/8 bg-card hover:border-accent/50 hover:bg-accent/2")
              }
            >
              {active && (
                <span className="absolute top-3 right-3 size-4 rounded-full bg-accent grid place-items-center">
                  <Check className="size-2.5 text-brand-950" />
                </span>
              )}
              <span
                className={
                  "font-serif text-lg font-medium italic transition-colors " +
                  (active ? "text-brand-900" : "text-brand-900 group-hover:text-accent")
                }
              >
                {label}
              </span>
              <span className="text-[11px] text-brand-900/50 leading-relaxed">{desc}</span>
            </button>
          );
        })}
      </div>

      <StepActions
        onContinue={onContinue}
        canContinue={!!selected}
        onBack={onBack}
        continueLabel="Continue →"
      />
    </section>
  );
}

// ── Step 4: Mood ───────────────────────────────────────────────────────────────

function MoodStep({
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  selected: string;
  onSelect: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step 4 of 5</Eyebrow>
      <Heading>Select the atmosphere.</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        The mood shapes lighting, color temperature, and the overall feeling of the space.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        {MOODS.map(({ value, label, color }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              id={`mood-${value.toLowerCase().replace(/[\s&]+/g, "-")}`}
              onClick={() => onSelect(value)}
              className={
                "group relative p-6 border text-left transition-all duration-200 cursor-pointer " +
                (active ? "border-accent shadow-sm" : "border-brand-900/8 hover:border-accent/50")
              }
            >
              {active && (
                <span className="absolute top-3 right-3 size-4 rounded-full bg-accent grid place-items-center">
                  <Check className="size-2.5 text-brand-950" />
                </span>
              )}
              <div className={`w-full h-12 rounded mb-4 bg-gradient-to-br ${color}`} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          );
        })}
      </div>

      <StepActions
        onContinue={onContinue}
        canContinue={!!selected}
        onBack={onBack}
        continueLabel="Continue →"
      />
    </section>
  );
}

// ── Step 5: Optional Instructions ─────────────────────────────────────────────

function InstructionsStep({
  value,
  onChange,
  wallpaper,
  roomType,
  style,
  mood,
  variationCount,
  onVariationCountChange,
  onGenerate,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  wallpaper: Wallpaper;
  roomType: string;
  style: string;
  mood: string;
  variationCount: number;
  onVariationCountChange: (count: number) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step 5 of 5</Eyebrow>
      <Heading>Anything else?</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Add any extra details — optional but helps the AI refine your design.
      </p>

      {/* Design summary card */}
      <div className="bg-card border border-brand-900/8 p-6 mb-8 flex gap-5 items-start max-w-xl">
        <img
          src={wallpaper.image}
          alt={wallpaper.title}
          className="size-16 object-cover shrink-0 outline-1 -outline-offset-1 outline-black/5"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
            Design Summary
          </p>
          <p className="text-sm font-semibold">{wallpaper.title}</p>
          <p className="text-xs text-brand-900/55">
            {roomType} · {style} · {mood}
          </p>
        </div>
      </div>

      <div className="max-w-xl mb-6">
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">
            Number of Variations
          </p>
          <div className="grid grid-cols-4 gap-2">
            {VARIATION_COUNT_OPTIONS.map((count) => {
              const active = variationCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onVariationCountChange(count)}
                  className={
                    "border px-4 py-3 text-center text-[11px] uppercase tracking-[0.18em] transition-colors cursor-pointer " +
                    (active
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-brand-900/12 bg-card hover:border-accent hover:text-accent")
                  }
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          id="custom-prompt-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe any additional details…"
          rows={4}
          className="w-full border border-brand-900/15 bg-card px-5 py-4 text-sm resize-none focus:outline-none focus:border-accent transition-colors placeholder:text-brand-900/30"
        />
        {/* Example chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {PROMPT_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => onChange(value ? `${value}, ${ex}` : ex)}
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] border border-brand-900/12 bg-card hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              + {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          id="generate-room-btn"
          onClick={onGenerate}
          className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
        >
          <Sparkles className="size-3.5" />
          Generate AI Visualization
        </button>
        <BackBtn onClick={onBack} />
      </div>

      <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/35 mt-4">
        AI will generate {variationCount} unique variation{variationCount === 1 ? "" : "s"} · Takes
        30–90 seconds
      </p>
    </section>
  );
}

// ── Generating Screen ──────────────────────────────────────────────────────────

function GeneratingScreen({
  wallpaper,
  variationCount,
  error,
  onRetry,
  onBack,
}: {
  wallpaper: Wallpaper;
  variationCount: number;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (error) return;
    const start = Date.now();
    const duration = Math.max(30000, variationCount * 18000);
    const tick = setInterval(() => {
      const p = Math.min(92, ((Date.now() - start) / duration) * 100);
      setProgress(p);
    }, 200);
    return () => clearInterval(tick);
  }, [error, variationCount]);

  useEffect(() => {
    if (error) return;
    const rot = setInterval(() => setMsgIdx((i) => (i + 1) % GENERATING_MESSAGES.length), 2500);
    return () => clearInterval(rot);
  }, [error]);

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 max-w-lg mx-auto">
        <div className="size-20 mb-8 bg-red-500/10 text-red-500 rounded-full grid place-items-center">
          <span className="text-3xl">✕</span>
        </div>
        <Eyebrow>Generation Failed</Eyebrow>
        <h1 className="font-serif text-4xl mt-3 mb-6">Something went wrong.</h1>
        <p className="text-brand-900/70 mb-8 leading-relaxed">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            id="retry-generation-btn"
            onClick={onRetry}
            className="bg-brand-900 text-brand-50 px-8 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className="size-3.5" /> Try Again
          </button>
          <button
            onClick={onBack}
            className="border border-brand-900/15 px-8 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
      {/* Animated ring */}
      <div className="relative mb-10">
        <div className="relative size-32">
          <div className="absolute inset-0 rounded-full border border-brand-900/10" />
          <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <div className="absolute inset-[6px] rounded-full border border-accent/20" />
          <div className="absolute inset-0 grid place-items-center">
            <Sparkles className="size-9 text-accent" />
          </div>
        </div>
        {/* Wallpaper preview */}
        <div className="absolute -bottom-3 -right-3 size-14 rounded-full border-4 border-card overflow-hidden shadow-xl">
          <img src={wallpaper.image} alt={wallpaper.title} className="w-full h-full object-cover" />
        </div>
      </div>

      <Eyebrow>AI Room Designer</Eyebrow>
      <h1 className="font-serif text-5xl md:text-6xl mt-3 mb-3 font-medium">
        Designing your space…
      </h1>
      <p className="text-brand-900/60 text-lg mb-2">
        Our AI is creating a room around your wallpaper.
      </p>

      {/* Rotating message */}
      <div className="h-8 flex items-center justify-center mb-10">
        <p
          key={msgIdx}
          className="font-serif text-xl italic text-brand-900/70 animate-in fade-in duration-500"
        >
          {GENERATING_MESSAGES[msgIdx]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm h-px bg-brand-900/10 overflow-hidden mb-3">
        <div
          className="h-full bg-accent transition-[width] duration-200 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-6 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
        <span>{Math.round(progress)}%</span>
        <span>·</span>
        <span>
          Generating {variationCount} variation{variationCount === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>~30–90 seconds</span>
      </div>
    </div>
  );
}

// ── Result Gallery ─────────────────────────────────────────────────────────────

const getVariationLabel = (index: number) => String.fromCharCode(65 + (index % 26));

const downloadImage = async (url: string, filename: string, onComplete?: () => Promise<void> | void) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    await onComplete?.();
  } catch {
    window.open(url, "_blank");
    await onComplete?.();
  }
};

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 5 3.1 9.3 7.5 11-.1-.9-.2-2.4 0-3.4.2-.9 1.4-5.7 1.4-5.7s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.5 2.6-5.5 5.3 0 1 .4 2.2.9 2.8.1.1.1.2.1.3-.1.4-.3 1.2-.3 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.4 8-7.4 4.2 0 7.4 3 7.4 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1-1 2.3-1.5 3.1.4.1.9.2 1.4.2 6.6 0 12-5.4 12-12S18.6 0 12 0Z" />
    </svg>
  );
}

function ResultGallery({
  generationId,
  wallpaper,
  roomType,
  style,
  mood,
  generatedImages,
  selectedImageId,
  onSelectImage,
  onGenerateMore,
  onCreateNew,
  generating,
  variationCount,
}: {
  generationId: string | null;
  wallpaper: Wallpaper;
  roomType: string;
  style: string;
  mood: string;
  generatedImages: GeneratedImage[];
  selectedImageId: string | null;
  onSelectImage: (id: string) => void;
  onGenerateMore: () => void;
  onCreateNew: () => void;
  generating: boolean;
  variationCount: number;
}) {
  const [shareToast, setShareToast] = useState(false);
  const [mainImageLoaded, setMainImageLoaded] = useState(false);
  const activeIndex = Math.max(
    0,
    generatedImages.findIndex((image) => image.id === selectedImageId),
  );
  const activeImage = generatedImages[activeIndex] || generatedImages[0];
  const activeImageUrl = activeImage?.url || "";
  const activeLabel = getVariationLabel(activeIndex);
  const disabled = generating;
  const sharePlatforms = [
    {
      name: "Email",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent("Wallpaper visualization")}&body=${encodeURIComponent(activeImageUrl)}`,
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(activeImageUrl)}`,
    },
    {
      name: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(activeImageUrl)}`,
    },
    {
      name: "Instagram",
      icon: Instagram,
      href: "https://www.instagram.com/",
    },
    {
      name: "Pinterest",
      icon: PinterestIcon,
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(activeImageUrl)}`,
    },
  ];

  const recordVisualizationActivity = async (
    eventType: "visualization_shared" | "visualization_downloaded",
    format?: "PNG" | "JPG",
  ) => {
    const entityType = activeImage?.visualizationId ? "visualization" : "ai_generation";
    const entityId = activeImage?.visualizationId || generationId || null;
    await logActivityEvent({
      eventType,
      entityType,
      entityId,
      metadata: {
        visualization_id: activeImage?.visualizationId || null,
        wallpaper_id: wallpaper.id,
        wallpaper_name: wallpaper.title,
        room_type: roomType,
        format: format || null,
        thumbnail_url: activeImageUrl,
      },
    });
  };

  const handleShare = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(activeImageUrl);
      await recordVisualizationActivity("visualization_shared");
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    } catch {
      window.open(activeImageUrl, "_blank");
    }
  };

  useEffect(() => {
    setMainImageLoaded(false);
  }, [activeImageUrl]);

  return (
    <section>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <Eyebrow>AI Room Designer · Result</Eyebrow>
          <h1 className="font-serif text-5xl md:text-6xl mt-2">Your designs.</h1>
          <p className="text-brand-900/55 mt-3">
            {roomType} · {style} · {mood}
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            id="create-new-design-btn"
            onClick={onCreateNew}
            disabled={disabled}
            className="border border-brand-900/15 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Plus className="size-3.5" /> Create New Design
          </button>
          <button
            id="generate-more-btn"
            onClick={onGenerateMore}
            disabled={disabled}
            className="bg-brand-900 text-brand-50 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> Generate More Like This
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* Main preview */}
        <div>
          <div className="relative min-h-[320px] bg-brand-900/5 overflow-hidden">
            {!mainImageLoaded && (
              <div className="absolute inset-0 z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-100 via-card to-brand-100" />
                <Skeleton className="absolute inset-0 h-full w-full rounded-none opacity-50" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
                  <div className="relative size-14">
                    <div className="absolute inset-0 rounded-full border border-accent/25" />
                    <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    <div className="absolute inset-0 grid place-items-center">
                      <Sparkles className="size-4 text-accent" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                      Loading Preview
                    </p>
                    <p className="mt-2 text-sm text-brand-900/55">
                      Your generated image is being prepared for display.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={`Variation ${activeLabel}`}
              onLoad={() => setMainImageLoaded(true)}
              onError={() => setMainImageLoaded(true)}
              className={
                "w-full max-h-[75vh] object-cover shadow-2xl animate-in fade-in duration-500 transition-opacity " +
                (mainImageLoaded ? "opacity-100" : "opacity-0")
              }
            />
            {/* Wallpaper badge */}
            <div className="absolute bottom-5 left-5 bg-card/95 backdrop-blur-md p-3.5 shadow-xl border border-white/20 flex items-center gap-3 max-w-[260px]">
              <img src={wallpaper.image} alt="" className="size-12 object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.2em] text-brand-900/40">Wallpaper</p>
                <p className="text-sm font-semibold truncate">{wallpaper.title}</p>
                <p className="text-[9px] text-brand-900/40 mt-0.5">Variation {activeLabel}</p>
              </div>
            </div>
            {/* AI badge */}
            <div className="absolute top-4 right-4 bg-accent/90 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
              <Sparkles className="size-3 text-brand-950" />
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-brand-950">
                AI Generated
              </span>
            </div>
            {generating && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-brand-950/10 animate-pulse" />
                <div className="absolute left-5 right-5 top-5 bg-card/95 backdrop-blur-md border border-white/30 shadow-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="relative size-12 shrink-0">
                    <div className="absolute inset-0 rounded-full border border-accent/30" />
                    <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    <div className="absolute inset-0 grid place-items-center">
                      <Sparkles className="size-4 text-accent" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
                      Generating More
                    </p>
                    <p className="text-sm text-brand-900/65 mt-1">
                      New room variations are being added to this result.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Variation thumbnails */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">
              Generated Variations
            </p>
            <div className="grid grid-cols-4 gap-3">
              {generatedImages.map((image, i) => {
                const label = getVariationLabel(i);
                const active = activeImage?.id === image.id;
                return (
                  <button
                    key={image.id}
                    id={`variation-${label}`}
                    onClick={() => onSelectImage(image.id)}
                    disabled={disabled}
                    className={
                      "group relative aspect-[4/3] overflow-hidden transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 " +
                      (active
                        ? "outline outline-2 outline-accent outline-offset-2"
                        : "hover:outline hover:outline-1 hover:outline-accent/50 hover:outline-offset-1")
                    }
                  >
                    <img
                      src={image.url}
                      alt={`Variation ${label}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute bottom-1.5 left-1.5 bg-card/90 backdrop-blur-sm px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] font-bold">
                      {label}
                    </div>
                    {active && (
                      <div className="absolute top-1.5 right-1.5 size-4 rounded-full bg-accent grid place-items-center">
                        <Check className="size-2.5 text-brand-950" />
                      </div>
                    )}
                  </button>
                );
              })}
              {generating &&
                Array.from({ length: Math.max(1, Math.min(variationCount, 4)) }).map((_, i) => (
                  <ResultPlaceholderThumb key={`pending-${i}`} index={i} />
                ))}
            </div>
          </div>
        </div>

        {/* Actions panel */}
        <div className="lg:sticky lg:top-28 space-y-4">
          {/* Design info */}
          <div className="bg-card border border-brand-900/8 p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
              Design Details
            </p>
            <div className="space-y-1.5">
              <DetailRow label="Room" value={roomType} />
              <DetailRow label="Style" value={style} />
              <DetailRow label="Mood" value={mood} />
              <DetailRow label="Wallpaper" value={wallpaper.title} />
            </div>
          </div>

          {generating && <ResultGenerationStatus variationCount={variationCount} />}

          {/* Download buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              id="download-png-btn"
              onClick={() =>
                downloadImage(activeImageUrl, `${wallpaper.code}_room_${activeLabel}.png`, () =>
                  recordVisualizationActivity("visualization_downloaded", "PNG"),
                )
              }
              disabled={disabled}
              className="inline-flex items-center justify-center gap-2 border border-brand-900/15 px-4 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="size-3.5" /> PNG
            </button>
            <button
              id="download-jpg-btn"
              onClick={() =>
                downloadImage(activeImageUrl, `${wallpaper.code}_room_${activeLabel}.jpg`, () =>
                  recordVisualizationActivity("visualization_downloaded", "JPG"),
                )
              }
              disabled={disabled}
              className="inline-flex items-center justify-center gap-2 border border-brand-900/15 px-4 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="size-3.5" /> JPG
            </button>
          </div>

          {/* Share */}
          <div className="bg-card border border-brand-900/8 p-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">Share</p>
            <div className="grid grid-cols-3 gap-2">
              {sharePlatforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <a
                    key={platform.name}
                    href={disabled ? undefined : platform.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      void recordVisualizationActivity("visualization_shared");
                    }}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : undefined}
                    title={`Share via ${platform.name}`}
                    className={
                      "group flex min-w-0 flex-col items-center justify-center gap-2 border border-brand-900/10 px-2 py-4 text-center transition-colors " +
                      (disabled
                        ? "pointer-events-none opacity-45"
                        : "hover:border-accent hover:bg-accent/5")
                    }
                  >
                    <Icon className="size-5 shrink-0 text-brand-900/70 group-hover:text-accent transition-colors" />
                    <span className="max-w-full truncate text-[9px] uppercase tracking-[0.12em] text-brand-900/55">
                      {platform.name}
                    </span>
                  </a>
                );
              })}
              <button
                id="share-link-btn"
                onClick={handleShare}
                disabled={disabled}
                title="Copy link"
                className="group flex min-w-0 flex-col items-center justify-center gap-2 border border-brand-900/10 px-2 py-4 text-center transition-colors hover:border-accent hover:bg-accent/5 disabled:pointer-events-none disabled:opacity-45"
              >
                {shareToast ? (
                  <Check className="size-5 shrink-0 text-accent" />
                ) : (
                  <LinkIcon className="size-5 shrink-0 text-brand-900/70 group-hover:text-accent transition-colors" />
                )}
                <span className="max-w-full truncate text-[9px] uppercase tracking-[0.12em] text-brand-900/55">
                  {shareToast ? "Copied" : "Copy Link"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultPlaceholderThumb({ index }: { index: number }) {
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden border border-dashed border-accent/45 bg-card"
      aria-label={`Pending generated variation ${index + 1}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-brand-100 via-card to-brand-100 animate-pulse" />
      <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-r from-transparent via-white/55 to-transparent animate-pulse" />
      <div className="absolute inset-0 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-accent" />
      </div>
      <div className="absolute bottom-1.5 left-1.5 bg-card/90 backdrop-blur-sm px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] font-bold text-brand-900/45">
        Next
      </div>
    </div>
  );
}

function ResultGenerationStatus({ variationCount }: { variationCount: number }) {
  return (
    <div className="overflow-hidden border border-accent/30 bg-accent/5 p-5 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-full bg-card grid place-items-center shadow-sm">
          <Loader2 className="size-4 animate-spin text-accent" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
            Rendering
          </p>
          <p className="text-sm text-brand-900/65">
            Preparing {variationCount} new variation{variationCount === 1 ? "" : "s"}.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <span className="h-1 bg-accent animate-pulse" />
        <span className="h-1 bg-accent/60 animate-pulse [animation-delay:160ms]" />
        <span className="h-1 bg-accent/30 animate-pulse [animation-delay:320ms]" />
      </div>
    </div>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.24em] text-accent font-medium mb-3">
      {children}
    </p>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-serif text-5xl md:text-6xl mb-6 font-medium leading-none">{children}</h1>
  );
}

function BackBtn({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-brand-900 transition-colors cursor-pointer " +
        className
      }
    >
      <ChevronLeft className="size-3.5" /> Back
    </button>
  );
}

function StepActions({
  onContinue,
  canContinue,
  onBack,
  continueLabel = "Continue →",
}: {
  onContinue: () => void;
  canContinue: boolean;
  onBack: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {continueLabel}
      </button>
      <BackBtn onClick={onBack} />
    </div>
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
