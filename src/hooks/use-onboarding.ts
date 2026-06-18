import { useMemo, useState, useEffect } from "react";
import { useProfile } from "@/hooks/use-profile";
import { OnboardingService } from "@/lib/onboarding";

interface OnboardingMetrics {
  wallpaperCount: number;
  visualizationCount: number;
}

/**
 * Derives onboarding state from the current profile + dashboard metrics.
 * Reacts to the "onboarding_progress_updated" window event so that
 * localStorage-tracked steps (View / Share) update the checklist instantly
 * without requiring a page reload.
 */
export function useOnboarding(metrics?: OnboardingMetrics | null) {
  const { data: profile, isLoading: profileLoading } = useProfile();

  // ── Reactive localStorage tick ────────────────────────────────────────────
  // Increment this whenever we know localStorage has changed so useMemo re-runs.
  const [lsTick, setLsTick] = useState(0);

  useEffect(() => {
    const handler = () => setLsTick((t) => t + 1);
    window.addEventListener("onboarding_progress_updated", handler);
    return () => window.removeEventListener("onboarding_progress_updated", handler);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isNewUser     = useMemo(() => OnboardingService.isNewUser(profile), [profile]);
  const hasStudioName = useMemo(() => OnboardingService.hasStudioName(profile), [profile]);

  // lsTick in the deps array forces re-evaluation when the custom event fires
  const progress = useMemo(
    () =>
      OnboardingService.getProgress(profile, {
        wallpaperCount: metrics?.wallpaperCount ?? 0,
        visualizationCount: metrics?.visualizationCount ?? 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, metrics?.wallpaperCount, metrics?.visualizationCount, lsTick],
  );

  const isOnboardingHidden =
    !!profile?.onboarding_hidden || !!profile?.onboarding_completed;

  return {
    profile,
    profileLoading,
    isNewUser,
    hasStudioName,
    progress,
    isOnboardingHidden,
    companyId: profile?.company_id ?? null,
    companyName: profile?.companies?.name ?? null,
  };
}

