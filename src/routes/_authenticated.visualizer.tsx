import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { AppShell } from "@/components/site/app-shell";
import { WizardStepper } from "@/components/site/wizard-stepper";
import { StickySelected } from "@/components/site/sticky-selected";
import { SharePanel } from "@/components/site/share-panel";
import {
  wallpapers,
  mockups,
  mockupCategories,
  getWallpaper,
  type Wallpaper,
  type Mockup,
} from "@/lib/wallpapers/data";
import resultPreview from "@/assets/result-preview.jpg";
import mockupLiving from "@/assets/mockup-living.jpg";
import mockupBedroom from "@/assets/mockup-bedroom.jpg";
import mockupOffice from "@/assets/mockup-office.jpg";
import mockupCafe from "@/assets/mockup-cafe.jpg";
import mockupRestaurant from "@/assets/mockup-restaurant.jpg";
import { Sparkles } from "lucide-react";

const searchSchema = z.object({ wallpaper: z.string().optional() });

export const Route = createFileRoute("/_authenticated/visualizer")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Visualizer — Murra" },
      {
        name: "description",
        content: "Preview a wallpaper on a staged mockup or your own room photo.",
      },
    ],
  }),
  component: Visualizer,
});

type Step =
  | "wallpaper"
  | "experience"
  | "mockup"
  | "upload"
  | "detect"
  | "manual"
  | "ai-style"
  | "ai-loading"
  | "result";
type ResultSource = "mockup" | "upload" | "ai";

function Visualizer() {
  const search = Route.useSearch();
  const initial = search.wallpaper ? (getWallpaper(search.wallpaper) ?? null) : null;
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(initial);
  const [mockup, setMockup] = useState<Mockup | null>(null);
  const [step, setStep] = useState<Step>(initial ? "experience" : "wallpaper");
  const [uploadedImg, setUploadedImg] = useState<string | null>(null);
  const [aiStyle, setAiStyle] = useState<AiStyle | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>("mockup");

  const wizardStep: 1 | 2 | 3 | 4 =
    step === "wallpaper"
      ? 1
      : step === "experience" || step === "mockup" || step === "upload" || step === "ai-style"
        ? 2
        : step === "detect" || step === "manual" || step === "ai-loading"
          ? 3
          : 4;

  return (
    <AppShell contentClassName="pb-32">
      <div className="border-b border-brand-900/5 bg-card sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex items-center justify-between gap-6">
          <WizardStepper current={wizardStep} />
          <Link
            to="/wallpapers"
            className="hidden md:block text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent shrink-0"
          >
            ✕ Exit
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        {step === "wallpaper" && (
          <SelectWallpaper
            onPick={(w) => {
              setWallpaper(w);
              setStep("experience");
            }}
          />
        )}
        {step === "experience" && wallpaper && (
          <ExperienceSelect
            onMockup={() => setStep("mockup")}
            onUpload={() => setStep("upload")}
            onAi={() => setStep("ai-style")}
            onBack={() => setStep("wallpaper")}
          />
        )}
        {step === "mockup" && wallpaper && (
          <MockupGallery
            onPick={(m) => {
              setMockup(m);
              setResultSource("mockup");
              setStep("result");
            }}
            onBack={() => setStep("experience")}
          />
        )}
        {step === "upload" && wallpaper && (
          <UploadRoom
            uploadedImg={uploadedImg}
            setUploadedImg={setUploadedImg}
            onContinue={() => setStep("detect")}
            onBack={() => setStep("experience")}
          />
        )}
        {step === "detect" && wallpaper && uploadedImg && (
          <WallDetect
            img={uploadedImg}
            onGood={() => {
              setResultSource("upload");
              setStep("result");
            }}
            onAdjust={() => setStep("manual")}
            onBack={() => setStep("upload")}
          />
        )}
        {step === "manual" && wallpaper && uploadedImg && (
          <ManualEditor
            img={uploadedImg}
            onApply={() => {
              setResultSource("upload");
              setStep("result");
            }}
            onBack={() => setStep("detect")}
          />
        )}
        {step === "ai-style" && wallpaper && (
          <AiStyleSelect
            selected={aiStyle}
            onPick={(s) => setAiStyle(s)}
            onContinue={() => setStep("ai-loading")}
            onBack={() => setStep("experience")}
          />
        )}
        {step === "ai-loading" && wallpaper && aiStyle && (
          <AiLoading
            onDone={() => {
              setResultSource("ai");
              setStep("result");
            }}
          />
        )}
        {step === "result" && wallpaper && (
          <ResultView
            wallpaper={wallpaper}
            mockup={mockup}
            source={resultSource}
            aiStyle={aiStyle}
            onAnother={() => setStep("wallpaper")}
            onAnotherAi={() => setStep("ai-loading")}
          />
        )}
      </div>

      {wallpaper && step !== "wallpaper" && <StickySelected wallpaper={wallpaper} />}
    </AppShell>
  );
}

/* ────────── Step 1: Wallpaper ────────── */
function SelectWallpaper({ onPick }: { onPick: (w: Wallpaper) => void }) {
  return (
    <section>
      <Eyebrow>Step One</Eyebrow>
      <Heading>Choose a wallpaper.</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        Pick any pattern from the curated catalog to begin the visualization journey.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {wallpapers.map((w) => (
          <button key={w.id} onClick={() => onPick(w)} className="group block text-left">
            <div className="aspect-square overflow-hidden">
              <img
                src={w.image}
                alt={w.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
              {w.code}
            </p>
            <p className="text-sm font-medium">{w.title}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ────────── Step 2a: Experience Selection ────────── */
function ExperienceSelect({
  onMockup,
  onUpload,
  onAi,
  onBack,
}: {
  onMockup: () => void;
  onUpload: () => void;
  onAi: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>How would you like to preview this wallpaper?</Heading>
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <ExperienceCard
          letter="A"
          title="Ready Mockups"
          desc="Use professionally staged room scenes — living rooms, bedrooms, cafés and more."
          onClick={onMockup}
        />
        <ExperienceCard
          letter="B"
          title="Upload My Room"
          desc="Upload your own room photo and detect walls automatically."
          onClick={onUpload}
        />
        <ExperienceCard
          letter="C"
          title="Generate With AI"
          desc="Generate a completely new room scene using AI and apply this wallpaper automatically."
          onClick={onAi}
          badge={<Sparkles className="size-4" />}
        />
      </div>
      <BackBtn onClick={onBack} className="mt-12" />
    </section>
  );
}

function ExperienceCard({
  letter,
  title,
  desc,
  onClick,
  badge,
}: {
  letter: string;
  title: string;
  desc: string;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-card p-10 border border-brand-900/5 hover:border-accent transition-colors relative"
    >
      {badge && (
        <span className="absolute top-5 right-5 inline-flex items-center gap-1 bg-accent/10 text-accent px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] rounded-full">
          {badge} New
        </span>
      )}
      <span className="font-serif text-6xl italic text-accent">{letter}</span>
      <h3 className="font-serif text-3xl italic mt-6 mb-3">{title}</h3>
      <p className="text-sm text-brand-900/60 leading-relaxed mb-8">{desc}</p>
      <span className="text-[11px] uppercase tracking-[0.2em] text-brand-900 group-hover:text-accent transition-colors">
        Continue →
      </span>
    </button>
  );
}

/* ────────── Step 2c (alt): AI Style Selection ────────── */
interface AiStyle {
  id: string;
  name: string;
  image: string;
}
const aiStyles: AiStyle[] = [
  { id: "modern-living", name: "Modern Living Room", image: mockupLiving },
  { id: "luxury-living", name: "Luxury Living Room", image: mockupLiving },
  { id: "scandi-living", name: "Scandinavian Living Room", image: mockupLiving },
  { id: "min-bedroom", name: "Minimalist Bedroom", image: mockupBedroom },
  { id: "lux-bedroom", name: "Luxury Bedroom", image: mockupBedroom },
  { id: "office", name: "Home Office", image: mockupOffice },
  { id: "cafe", name: "Cafe", image: mockupCafe },
  { id: "restaurant", name: "Restaurant", image: mockupRestaurant },
  { id: "hotel", name: "Hotel Suite", image: mockupBedroom },
];

function AiStyleSelect({
  selected,
  onPick,
  onContinue,
  onBack,
}: {
  selected: AiStyle | null;
  onPick: (s: AiStyle) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Two · AI</Eyebrow>
      <Heading>Choose a Room Style</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Pick a setting and our AI will compose a fresh room scene with your wallpaper applied.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {aiStyles.map((s) => {
          const active = selected?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className={
                "group text-left transition-all " +
                (active ? "outline outline-2 outline-accent outline-offset-4" : "")
              }
            >
              <div className="aspect-[4/3] overflow-hidden bg-brand-100">
                <img
                  src={s.image}
                  alt={s.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-base font-medium">{s.name}</p>
                {active && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-accent">
                    Selected
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mt-10">
        <button
          onClick={onContinue}
          disabled={!selected}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-2"
        >
          <Sparkles className="size-3.5" /> Continue
        </button>
        <BackBtn onClick={onBack} className="self-center" />
      </div>
    </section>
  );
}

/* ────────── Step 3 (AI): Loading ────────── */
const AI_MESSAGES = [
  "Creating room layout",
  "Applying wallpaper",
  "Adjusting perspective",
  "Finalizing visualization",
];
function AiLoading({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const duration = 8000;
    const tick = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / duration) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(tick);
        setTimeout(onDone, 350);
      }
    }, 80);
    const rot = setInterval(() => setMsgIdx((i) => (i + 1) % AI_MESSAGES.length), 1800);
    return () => {
      clearInterval(tick);
      clearInterval(rot);
    };
  }, [onDone]);

  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="relative size-24 mb-10">
        <div className="absolute inset-0 rounded-full border border-brand-900/10" />
        <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="absolute inset-0 grid place-items-center">
          <Sparkles className="size-7 text-accent" />
        </div>
      </div>
      <Eyebrow>Generating</Eyebrow>
      <h1 className="font-serif text-5xl md:text-6xl mt-3 mb-6">Generating Your Visualization</h1>
      <p className="font-serif text-2xl italic text-brand-900/70 mb-10 transition-opacity">
        {AI_MESSAGES[msgIdx]}…
      </p>
      <div className="w-full max-w-md h-px bg-brand-900/10 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/40 mt-4">
        Typically 5–15 seconds
      </p>
    </section>
  );
}

/* ────────── Step 2b: Mockup Gallery ────────── */
function MockupGallery({ onPick, onBack }: { onPick: (m: Mockup) => void; onBack: () => void }) {
  const [cat, setCat] = useState("All");
  const list = mockups.filter((m) => cat === "All" || m.category === cat);
  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>Pick a room.</Heading>
      <div className="flex gap-1 mt-10 mb-10 overflow-x-auto border-b border-brand-900/5">
        {mockupCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "px-4 py-3 text-[11px] uppercase tracking-[0.2em] border-b-2 -mb-px " +
              (cat === c
                ? "border-brand-900 text-brand-900"
                : "border-transparent text-brand-900/50 hover:text-brand-900")
            }
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((m) => (
          <button key={m.id} onClick={() => onPick(m)} className="group text-left">
            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={m.image}
                alt={m.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">
                  {m.category}
                </p>
                <p className="text-base font-medium mt-1">{m.name}</p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                Select →
              </span>
            </div>
          </button>
        ))}
      </div>
      <BackBtn onClick={onBack} className="mt-12" />
    </section>
  );
}

/* ────────── Step 2c: Upload Room ────────── */
function UploadRoom({
  uploadedImg,
  setUploadedImg,
  onContinue,
  onBack,
}: {
  uploadedImg: string | null;
  setUploadedImg: (v: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setUploadedImg(e.target?.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>Upload your room.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Pick a well-lit, straight-on photograph of the wall you want to visualize.
      </p>

      {!uploadedImg ? (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="block border border-dashed border-brand-900/20 bg-card aspect-[16/9] flex flex-col items-center justify-center text-center cursor-pointer hover:border-accent transition-colors"
        >
          <span className="font-serif text-4xl italic text-brand-900/40">
            Drag & drop your photo
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-brand-900/30 mt-4">
            or click to browse · JPG · PNG · HEIC
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      ) : (
        <div className="space-y-6">
          <img
            src={uploadedImg}
            alt="Uploaded room"
            className="w-full max-h-[600px] object-contain bg-brand-900/5"
          />
          <div className="flex gap-3">
            <button
              onClick={onContinue}
              className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
            >
              Continue → Wall Detection
            </button>
            <button
              onClick={() => setUploadedImg(null)}
              className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card"
            >
              Replace Photo
            </button>
          </div>
        </div>
      )}
      <BackBtn onClick={onBack} className="mt-12" />
    </section>
  );
}

/* ────────── Step 3a: Wall Detect ────────── */
function WallDetect({
  img,
  onGood,
  onAdjust,
  onBack,
}: {
  img: string;
  onGood: () => void;
  onAdjust: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Three</Eyebrow>
      <Heading>Wall detected.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Our AI identified the primary wall. Confirm or refine the boundaries manually.
      </p>
      <div className="relative bg-brand-100 overflow-hidden">
        <img src={img} alt="Detected room" className="w-full max-h-[600px] object-contain" />
        <div className="absolute inset-[12%] border-2 border-gilded bg-gilded/15 backdrop-blur-[1px]">
          <Corner pos="top-left" />
          <Corner pos="top-right" />
          <Corner pos="bottom-left" />
          <Corner pos="bottom-right" />
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-md shadow-xl border border-white/20 px-6 py-3 flex items-center gap-4">
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium">
            Primary wall · 92% confidence
          </span>
          <span className="size-2 rounded-full bg-gilded" />
        </div>
      </div>
      <div className="flex gap-3 mt-8">
        <button
          onClick={onGood}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800"
        >
          Looks Good
        </button>
        <button
          onClick={onAdjust}
          className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card"
        >
          Adjust Manually
        </button>
      </div>
      <BackBtn onClick={onBack} className="mt-8" />
    </section>
  );
}

function Corner({ pos }: { pos: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) {
  const cls: Record<string, string> = {
    "top-left": "-top-2 -left-2",
    "top-right": "-top-2 -right-2",
    "bottom-left": "-bottom-2 -left-2",
    "bottom-right": "-bottom-2 -right-2",
  };
  return (
    <div
      className={
        "absolute size-4 bg-card border-2 border-gilded rounded-full shadow-lg " + cls[pos]
      }
    />
  );
}

/* ────────── Step 3b: Manual Editor ────────── */
function ManualEditor({
  img,
  onApply,
  onBack,
}: {
  img: string;
  onApply: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Three · Manual</Eyebrow>
      <Heading>Adjust wall boundaries.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Drag the corner handles to refine the polygon. Use zoom for precision work.
      </p>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div className="relative bg-brand-100 overflow-hidden">
          <img src={img} alt="Editor" className="w-full max-h-[600px] object-contain" />
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon
              points="20%,15% 80%,18% 78%,82% 22%,80%"
              fill="rgb(197 160 89 / 0.18)"
              stroke="rgb(197 160 89)"
              strokeWidth="2"
            />
          </svg>
          {[
            ["20%", "15%"],
            ["80%", "18%"],
            ["78%", "82%"],
            ["22%", "80%"],
          ].map(([l, t], i) => (
            <div
              key={i}
              className="absolute size-5 bg-card border-2 border-gilded rounded-full shadow-lg -translate-x-1/2 -translate-y-1/2 cursor-grab hover:scale-110 transition-transform"
              style={{ left: l, top: t }}
            />
          ))}
        </div>

        <aside className="bg-card p-6 border border-brand-900/5 self-start space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">Tools</p>
            <div className="grid grid-cols-2 gap-2">
              <ToolBtn>+ Zoom</ToolBtn>
              <ToolBtn>− Zoom</ToolBtn>
              <ToolBtn>+ Point</ToolBtn>
              <ToolBtn>Reset</ToolBtn>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">Polygon</p>
            <p className="text-sm">4 corner points</p>
            <p className="text-xs text-brand-900/50">
              Drag to refine. Add more for irregular walls.
            </p>
          </div>
        </aside>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={onApply}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800"
        >
          Apply Boundaries
        </button>
        <BackBtn onClick={onBack} />
      </div>
    </section>
  );
}

function ToolBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="border border-brand-900/10 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-accent hover:text-accent transition-colors">
      {children}
    </button>
  );
}

/* ────────── Step 4: Result ────────── */
function ResultView({
  wallpaper,
  mockup,
  source,
  aiStyle,
  onAnother,
  onAnotherAi,
}: {
  wallpaper: Wallpaper;
  mockup: Mockup | null;
  source: ResultSource;
  aiStyle: AiStyle | null;
  onAnother: () => void;
  onAnotherAi: () => void;
}) {
  const sourceLabel =
    source === "ai" && aiStyle
      ? `${aiStyle.name} · AI Generated`
      : mockup
        ? mockup.name
        : "Your Room";
  return (
    <section>
      <div className="mb-10">
        <Eyebrow>Result</Eyebrow>
        <Heading>Your visualization.</Heading>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="relative">
          <img
            src={resultPreview}
            alt="Final visualization"
            className="w-full max-h-[75vh] object-cover shadow-2xl outline-1 -outline-offset-1 outline-black/10"
          />
          <div className="absolute bottom-6 left-6 bg-card/95 backdrop-blur-md p-4 shadow-xl border border-white/20 flex items-center gap-4 max-w-xs">
            <img src={wallpaper.image} alt="" className="size-14 object-cover" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Applied</p>
              <p className="text-sm font-semibold">{wallpaper.title}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mt-0.5">
                {wallpaper.code} · {sourceLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-32">
          <SharePanel title="Share Visualization" />

          <div className="mt-6 flex flex-col gap-2">
            {source === "ai" && (
              <button
                onClick={onAnotherAi}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer"
              >
                <Sparkles className="size-3.5" /> Generate Another Version
              </button>
            )}
            <button
              onClick={onAnother}
              className="w-full border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer"
            >
              Create Another Variation
            </button>
            <Link
              to="/wallpapers"
              className="w-full text-center border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card"
            >
              Browse Collection
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────── Helpers ────────── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
      {children}
    </span>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="font-serif text-5xl md:text-6xl mt-3 mb-4">{children}</h1>;
}
function BackBtn({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent " + className
      }
    >
      ← Back
    </button>
  );
}
