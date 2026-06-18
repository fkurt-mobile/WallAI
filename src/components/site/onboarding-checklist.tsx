import { useState } from "react";
import { Check, Circle, ChevronRight, X, Upload, Sparkles, Eye, Share2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { OnboardingProgress } from "@/lib/onboarding";
import { OnboardingService } from "@/lib/onboarding";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";

interface OnboardingChecklistProps {
  progress: OnboardingProgress;
  onDismiss?: () => void;
}

const STEPS = [
  {
    label: "Name Your Studio",
    description: "Give your workspace a unique identity.",
    cta: null,
  },
  {
    label: "Upload First Wallpaper",
    description: "Add your first wallpaper to your catalog.",
    cta: { label: "Upload Wallpaper", to: "/wallpapers/new" as const, icon: Upload },
  },
  {
    label: "Generate First AI Design",
    description: "Transform a wallpaper into an AI room visualization.",
    cta: { label: "Create AI Design", to: "/tools/wallpaper-visualizer" as const, icon: Sparkles },
  },
  {
    label: "View a Visualization",
    description: "Open any AI-generated design to explore it.",
    cta: { label: "Browse Designs", to: "/visualizations" as const, icon: Eye },
  },
  {
    label: "Share a Visualization",
    description: "Share your first design with the world.",
    cta: { label: "View Designs", to: "/visualizations" as const, icon: Share2 },
  },
] as const;

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden bg-brand-900/8">
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-accent transition-all duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function OnboardingChecklist({ progress, onDismiss }: OnboardingChecklistProps) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    if (!profile?.id) return;
    setDismissing(true);
    try {
      await OnboardingService.hideOnboarding(profile.id);
      await queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      onDismiss?.();
    } catch {
      setDismissing(false);
    }
  };

  if (progress.isComplete) {
    return (
      <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50/80 px-5 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-700">
            Studio Ready
          </p>
          <p className="text-sm text-emerald-900/70">Your workspace is fully configured.</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
            className="ml-2 text-emerald-700/50 transition-colors hover:text-emerald-700"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-brand-900/8 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 py-5 pb-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-accent">
            Getting Started
          </p>
          <h3 className="mt-1 font-serif text-xl text-brand-900">
            Set up your studio
          </h3>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs font-medium tabular-nums text-brand-900/45">
            {progress.completedSteps.filter(Boolean).length}/5
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismissing}
              className="text-brand-900/30 transition-colors hover:text-brand-900/60"
              aria-label="Hide checklist"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <ProgressBar percent={progress.progressPercent} />

      {/* Steps */}
      <ul className="divide-y divide-brand-900/5">
        {STEPS.map((step, i) => {
          const done = progress.completedSteps[i];
          const isCurrent = progress.currentStep === i;

          return (
            <li
              key={step.label}
              className={`flex items-start gap-4 px-6 py-4 transition-colors ${
                isCurrent ? "bg-brand-50/60" : done ? "opacity-60" : ""
              }`}
            >
              {/* Icon */}
              <div className="mt-0.5 shrink-0">
                {done ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </div>
                ) : isCurrent ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent bg-white">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center">
                    <Circle className="h-5 w-5 text-brand-900/20" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? "text-brand-900/45" : "text-brand-900"}`}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-900/55">
                    {step.description}
                  </p>
                )}
                {isCurrent && step.cta && (
                  <Link
                    to={step.cta.to}
                    className="mt-3 inline-flex items-center gap-1.5 bg-brand-900 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-50 transition-colors hover:bg-brand-800"
                  >
                    <step.cta.icon className="h-3.5 w-3.5" />
                    {step.cta.label}
                    <ChevronRight className="h-3 w-3 opacity-60" />
                  </Link>
                )}
              </div>

              {/* Step number */}
              <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-brand-900/20">
                {i + 1}/5
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
