import { supabase } from "@/integrations/supabase/client";
import type { ProfileWithCompany } from "@/lib/services";

// ─── Constants ───────────────────────────────────────────────────────────────

const DUMMY_NAMES = [
  "Test Company",
  "New Company",
  "Demo Studio",
  "Default Organization",
  "Heim Studio",
  "Heim Studio",
];

const LS_VIZ_VIEWED  = "murra_onboarding_viz_viewed";
const LS_VIZ_SHARED  = "murra_onboarding_viz_shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingProgress {
  /** 0 = not started, 5 = fully complete */
  currentStep: number;
  /** One entry per checklist item [studio, wallpaper, design, viewed, shared] */
  completedSteps: [boolean, boolean, boolean, boolean, boolean];
  progressPercent: number;
  isComplete: boolean;
}

export interface OnboardingMetrics {
  wallpaperCount: number;
  visualizationCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDummyName(name: string | null | undefined): boolean {
  if (!name) return true;
  return DUMMY_NAMES.includes(name.trim());
}

function safeLs(key: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function setLs(key: string): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, "true");
    }
  } catch {
    // ignore
  }
}

// ─── Slug generator ───────────────────────────────────────────────────────────

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const OnboardingService = {
  /**
   * A user is "new" (needs onboarding) if:
   *   - their company has no name, OR the name is a dummy placeholder
   *   - AND they haven't completed onboarding yet
   */
  isNewUser(profile: ProfileWithCompany | null | undefined): boolean {
    if (!profile) return false;
    if (profile.onboarding_completed) return false;
    const companyName = profile.companies?.name;
    return isDummyName(companyName);
  },

  /** True if the user has set a real studio name */
  hasStudioName(profile: ProfileWithCompany | null | undefined): boolean {
    if (!profile) return false;
    const name = profile.companies?.name;
    return !!name && !isDummyName(name);
  },

  /** Compute the 5-step checklist progress */
  getProgress(
    profile: ProfileWithCompany | null | undefined,
    metrics: OnboardingMetrics,
  ): OnboardingProgress {
    const studioNamed    = this.hasStudioName(profile);
    const wallpaperDone  = metrics.wallpaperCount > 0;
    const designDone     = metrics.visualizationCount > 0;
    const vizViewed      = safeLs(LS_VIZ_VIEWED);
    const vizShared      = safeLs(LS_VIZ_SHARED);

    const completedSteps: [boolean, boolean, boolean, boolean, boolean] = [
      studioNamed,
      wallpaperDone,
      designDone,
      vizViewed,
      vizShared,
    ];

    const doneCount = completedSteps.filter(Boolean).length;
    const isComplete = doneCount === 5;

    // currentStep = index of first incomplete step (0-based)
    const currentStep = completedSteps.findIndex((done) => !done);

    return {
      currentStep: currentStep === -1 ? 5 : currentStep,
      completedSteps,
      progressPercent: Math.round((doneCount / 5) * 100),
      isComplete,
    };
  },

  /** Save the studio name to the companies table and advance onboarding step */
  async saveStudioName(companyId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    const slug = generateSlug(trimmed);

    const { error: companyError } = await supabase
      .from("companies")
      .update({ name: trimmed, slug })
      .eq("id", companyId);

    if (companyError) throw companyError;

    // Advance the onboarding step on the profile
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_step: 1, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }
  },

  /** Mark the onboarding as fully hidden/dismissed */
  async hideOnboarding(userId: string): Promise<void> {
    await supabase
      .from("profiles")
      .update({
        onboarding_hidden: true,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  },

  /** Mark onboarding as complete in the DB */
  async markComplete(userId: string): Promise<void> {
    await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        onboarding_step: 5,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  },

  /** Track that the user opened a visualization (localStorage) */
  markVisualizationViewed(): void {
    setLs(LS_VIZ_VIEWED);
  },

  /** Track that the user shared a visualization (localStorage) */
  markVisualizationShared(): void {
    setLs(LS_VIZ_SHARED);
    setLs(LS_VIZ_VIEWED); // sharing implies viewing
  },

  isVisualizationViewed(): boolean {
    return safeLs(LS_VIZ_VIEWED);
  },

  isVisualizationShared(): boolean {
    return safeLs(LS_VIZ_SHARED);
  },
};
