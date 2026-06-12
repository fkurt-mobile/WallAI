import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/site/app-shell";
import { SharePanel } from "@/components/site/share-panel";
import { type Wallpaper } from "@/lib/wallpapers/data";
import {
  Sparkles,
  ChevronLeft,
  RefreshCw,
  Plus,
  Check,
  Loader2,
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
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";

const searchSchema = z.object({ wallpaper: z.string().optional() });

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

type Step =
  | "wallpaper"
  | "room-type"
  | "style"
  | "mood"
  | "variation-count"
  | "instructions"
  | "generating"
  | "result";

interface DesignState {
  wallpaper: Wallpaper | null;
  roomType: string;
  style: string;
  mood: string;
  variationCount: number;
  customPrompt: string;
}

interface GeneratedVariation {
  id: string;
  preview_image_url: string;
  result_image_url: string;
  room_type: string;
  style: string;
  mood: string;
  created_at: string;
}

interface GenerationResult {
  id: string;
  wallpaper_id: string;
  room_type: string;
  style: string;
  mood: string;
  variation_count: number;
  variation_1_url: string | null;
  variation_2_url: string | null;
  variation_3_url: string | null;
  variation_4_url: string | null;
  visualizations: GeneratedVariation[];
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
    variationCount: 2,
    customPrompt: "",
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [activeVariation, setActiveVariation] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Fetch wallpapers ────────────────────────────────────────────────────────
  const { data: dbWallpapers = [], isLoading: wallpapersLoading } = useQuery({
    queryKey: ["wallpapers", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("company_id", profile.company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
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

  // ── Load wallpaper from query param ────────────────────────────────────────
  useEffect(() => {
    if (search.wallpaper && wallpapersList.length > 0) {
      const selected = wallpapersList.find((w) => w.id === search.wallpaper);
      if (selected) {
        setDesign((d) => ({ ...d, wallpaper: selected }));
        setStep("room-type");
      }
    }
  }, [search.wallpaper, wallpapersList]);

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
  const handleGenerate = async (referenceGenerationId?: string | null) => {
    if (!design.wallpaper || !design.roomType || !design.style || !design.mood) {
      toast.error("Please complete all required steps first.");
      return;
    }
    if (!companyId || !profile?.id) {
      toast.error("You must be logged in.");
      return;
    }

    setStep("generating");
    setGenerating(true);
    setGenError(null);
    setResult(null);

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
          variationCount: design.variationCount,
          customPrompt: design.customPrompt || undefined,
          referenceGenerationId: referenceGenerationId || undefined,
        }),
      });

      if (!response.ok) {
        let errMsg = "AI generation failed. Please try again.";
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (parseError) {
          void parseError;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      setResult(data);
      setActiveVariation(0);
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["ai-generations"] });
      queryClient.invalidateQueries({ queryKey: ["visualizations", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["wallpaper-visualizations"] });
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
      variationCount: 2,
      customPrompt: "",
    });
    setResult(null);
    setActiveVariation(0);
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
            : step === "variation-count"
              ? 5
              : step === "instructions"
                ? 6
                : 6;

  const variations = result?.visualizations ?? [];
  const activeVariationRecord = variations[activeVariation] || null;
  const activeImageUrl =
    activeVariationRecord?.preview_image_url || activeVariationRecord?.result_image_url || "";
  const activeShareUrl =
    typeof window !== "undefined" && activeVariationRecord
      ? `${window.location.origin}/visualizations/${activeVariationRecord.id}`
      : "";

  return (
    <AppShell contentClassName="pb-32">
      {/* ── Top bar with stepper ── */}
      {step !== "generating" && step !== "result" && (
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
            onContinue={() => setStep("variation-count")}
            onBack={() => setStep("style")}
          />
        )}

        {/* ── Step 5: Variation Count ── */}
        {step === "variation-count" && (
          <VariationCountStep
            selected={design.variationCount}
            onSelect={(v) => setDesign((d) => ({ ...d, variationCount: v }))}
            onContinue={() => setStep("instructions")}
            onBack={() => setStep("mood")}
          />
        )}

        {/* ── Step 6: Instructions ── */}
        {step === "instructions" && (
          <InstructionsStep
            value={design.customPrompt}
            onChange={(v) => setDesign((d) => ({ ...d, customPrompt: v }))}
            wallpaper={design.wallpaper!}
            roomType={design.roomType}
            style={design.style}
            mood={design.mood}
            variationCount={design.variationCount}
            onGenerate={handleGenerate}
            onBack={() => setStep("variation-count")}
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
        {step === "result" && result && design.wallpaper && (
          <ResultGallery
            wallpaper={design.wallpaper}
            roomType={design.roomType}
            style={design.style}
            mood={design.mood}
            variations={variations}
            activeVariation={activeVariation}
            onSelectVariation={setActiveVariation}
            activeImageUrl={activeImageUrl}
            shareUrl={activeShareUrl}
            onGenerateMore={() => handleGenerate(result.id)}
            onCreateNew={resetAll}
            generating={generating}
            variationCount={design.variationCount}
          />
        )}
      </div>

      {/* ── Sticky wallpaper bar ── */}
      {design.wallpaper && step !== "wallpaper" && step !== "generating" && step !== "result" && (
        <div className="fixed bottom-0 inset-x-0 lg:left-64 lg:right-0 z-30 border-t border-brand-900/8 bg-card/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
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
              className="self-start sm:self-auto text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent transition-colors shrink-0"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function AiDesignerStepper({ current }: { current: number }) {
  const steps = ["Wallpaper", "Room Type", "Style", "Mood", "Variations", "Generate"];
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

// ── Step 5: Variation Count ───────────────────────────────────────────────────

function VariationCountStep({
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  selected: number;
  onSelect: (v: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const options = [1, 2, 3, 4];
  return (
    <section>
      <Eyebrow>Step 5 of 6</Eyebrow>
      <Heading>How many variations would you like?</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        Fewer variations reduce cost. The default is 2, which keeps output focused and efficient.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 max-w-2xl">
        {options.map((value) => {
          const active = selected === value;
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={
                "relative p-8 border transition-all duration-200 cursor-pointer text-left flex flex-col gap-2 " +
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
              <span className="font-serif text-4xl italic">{value}</span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-brand-900/45">
                {value === 1 ? "Single option" : "Multiple options"}
              </span>
            </button>
          );
        })}
      </div>

      <StepActions
        onContinue={onContinue}
        canContinue={true}
        onBack={onBack}
        continueLabel="Continue →"
      />
    </section>
  );
}

// ── Step 6: Optional Instructions ─────────────────────────────────────────────

function InstructionsStep({
  value,
  onChange,
  wallpaper,
  roomType,
  style,
  mood,
  variationCount,
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
            {roomType} · {style} · {mood} · {variationCount} variation
            {variationCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="max-w-xl mb-6">
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
          onClick={() => onGenerate()}
          className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
        >
          <Sparkles className="size-3.5" />
          Generate AI Visualization
        </button>
        <BackBtn onClick={onBack} />
      </div>

      <p className="text-[10px] uppercase tracking-[0.18em] text-brand-900/35 mt-4">
        AI will generate {variationCount} unique variation{variationCount > 1 ? "s" : ""} · Takes
        approximately{" "}
        {variationCount === 1
          ? "20–30"
          : variationCount === 2
            ? "30–45"
            : variationCount === 3
              ? "45–60"
              : "60–90"}{" "}
        seconds
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
    const duration =
      variationCount === 1
        ? 25000
        : variationCount === 2
          ? 40000
          : variationCount === 3
            ? 55000
            : 70000;
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
            onClick={() => onRetry()}
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
          Generating {variationCount} variation{variationCount > 1 ? "s" : ""}
        </span>
        <span>·</span>
        <span>~30–90 seconds</span>
      </div>
    </div>
  );
}

// ── Result Gallery ─────────────────────────────────────────────────────────────

const VARIATION_LABELS = ["A", "B", "C", "D"];

const downloadImage = async (url: string, filename: string) => {
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
  } catch {
    window.open(url, "_blank");
  }
};

function ResultGallery({
  wallpaper,
  roomType,
  style,
  mood,
  variations,
  activeVariation,
  onSelectVariation,
  activeImageUrl,
  shareUrl,
  onGenerateMore,
  onCreateNew,
  generating,
  variationCount,
}: {
  wallpaper: Wallpaper;
  roomType: string;
  style: string;
  mood: string;
  variations: GeneratedVariation[];
  activeVariation: number;
  onSelectVariation: (i: number) => void;
  activeImageUrl: string;
  shareUrl: string;
  onGenerateMore: () => void;
  onCreateNew: () => void;
  generating: boolean;
  variationCount: number;
}) {
  return (
    <section>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <Eyebrow>AI Room Designer · Result</Eyebrow>
          <h1 className="font-serif text-5xl md:text-6xl mt-2">Your designs.</h1>
          <p className="text-brand-900/55 mt-3">
            {roomType} · {style} · {mood} · {variationCount} variation
            {variationCount > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            id="create-new-design-btn"
            onClick={onCreateNew}
            className="border border-brand-900/15 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="size-3.5" /> Create New Design
          </button>
          <button
            id="generate-more-btn"
            onClick={onGenerateMore}
            disabled={generating}
            className="bg-brand-900 text-brand-50 px-5 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
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
          <div className="relative bg-brand-900/5 overflow-hidden">
            <img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={`Variation ${VARIATION_LABELS[activeVariation] || activeVariation + 1}`}
              className="w-full max-h-[75vh] object-cover shadow-2xl animate-in fade-in duration-500"
            />
            {/* Wallpaper badge */}
            <div className="absolute bottom-5 left-5 bg-card/95 backdrop-blur-md p-3.5 shadow-xl border border-white/20 flex items-center gap-3 max-w-[260px]">
              <img src={wallpaper.image} alt="" className="size-12 object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.2em] text-brand-900/40">Wallpaper</p>
                <p className="text-sm font-semibold truncate">{wallpaper.title}</p>
                <p className="text-[9px] text-brand-900/40 mt-0.5">
                  Variation {VARIATION_LABELS[activeVariation] || activeVariation + 1}
                </p>
              </div>
            </div>
            {/* AI badge */}
            <div className="absolute top-4 right-4 bg-accent/90 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
              <Sparkles className="size-3 text-brand-950" />
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-brand-950">
                AI Generated
              </span>
            </div>
          </div>

          {/* Variation thumbnails */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">
              Generated Variations
            </p>
            <div className="grid grid-cols-4 gap-3">
              {variations.map((url, i) => (
                <button
                  key={i}
                  id={`variation-${VARIATION_LABELS[i]}`}
                  onClick={() => onSelectVariation(i)}
                  className={
                    "group relative aspect-[4/3] overflow-hidden transition-all cursor-pointer " +
                    (activeVariation === i
                      ? "outline outline-2 outline-accent outline-offset-2"
                      : "hover:outline hover:outline-1 hover:outline-accent/50 hover:outline-offset-1")
                  }
                >
                  <img
                    src={url.preview_image_url || url.result_image_url}
                    alt={`Variation ${VARIATION_LABELS[i] || i + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute bottom-1.5 left-1.5 bg-card/90 backdrop-blur-sm px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] font-bold">
                    {VARIATION_LABELS[i] || i + 1}
                  </div>
                  {activeVariation === i && (
                    <div className="absolute top-1.5 right-1.5 size-4 rounded-full bg-accent grid place-items-center">
                      <Check className="size-2.5 text-brand-950" />
                    </div>
                  )}
                </button>
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
              <DetailRow label="Variations" value={String(variationCount)} />
            </div>
          </div>

          <SharePanel
            title="Share this design"
            shareUrl={shareUrl}
            previewImageUrl={activeImageUrl}
          />

          {/* Generate more */}
          <button
            onClick={onGenerateMore}
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-900/5 border border-brand-900/8 px-4 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            Generate More Like This
          </button>

          {/* Create new */}
          <button
            onClick={onCreateNew}
            className="w-full inline-flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent cursor-pointer transition-colors py-2"
          >
            <Plus className="size-3.5" />
            Create New Design
          </button>
        </div>
      </div>
    </section>
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
