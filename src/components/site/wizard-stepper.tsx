const STEPS = ["Wallpaper", "Room", "Adjust", "Result"];

export function WizardStepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex gap-6 md:gap-12 overflow-x-auto">
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
            <span className="text-sm text-brand-900/60 mt-0.5">
              {step === 1
                ? "Select Wallpaper"
                : step === 2
                  ? "Select Room"
                  : step === 3
                    ? "Adjust Wall"
                    : "Preview Result"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
