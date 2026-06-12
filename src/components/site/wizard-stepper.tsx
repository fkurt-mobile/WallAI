// WizardStepper — kept for backwards compatibility (no longer used by AI Room Designer)
// The AI Room Designer uses its own AiDesignerStepper component inline.

const STEPS = ["Wallpaper", "Room Type", "Style", "Mood", "Generate"];

export function WizardStepper({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const subtitles = [
    "Select Wallpaper",
    "Choose Room Type",
    "Design Style",
    "Set Mood",
    "AI Generate",
  ];
  return (
    <div className="flex gap-6 md:gap-10 overflow-x-auto">
      {STEPS.map((label, idx) => {
        const step = idx + 1;
        const active = step === current;
        const done = step < current;
        return (
          <div
            key={label}
            className={
              "flex flex-col shrink-0 pb-2 border-b-2 transition-colors " +
              (active ? "border-brand-900" : done ? "border-gilded" : "border-brand-900/10")
            }
          >
            <span
              className={
                "text-[10px] font-bold uppercase tracking-[0.2em] " +
                (active ? "text-brand-900" : done ? "text-gilded" : "text-brand-900/40")
              }
            >
              {String(step).padStart(2, "0")} {label}
            </span>
            <span className="text-sm text-brand-900/60 mt-0.5">{subtitles[idx]}</span>
          </div>
        );
      })}
    </div>
  );
}
