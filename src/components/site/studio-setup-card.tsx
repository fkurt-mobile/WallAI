import { useState, useRef, useEffect } from "react";
import { Check, Sparkles } from "lucide-react";
import { OnboardingService, generateSlug } from "@/lib/onboarding";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface StudioSetupCardProps {
  companyId: string;
  onComplete: (studioName: string) => void;
}

const EXAMPLES = ["Nordic Interiors", "Urban Wall Studio", "Luxe Wallpaper Co."];

function validateStudioName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Studio name is required.";
  if (trimmed.length < 3) return "Studio name must be at least 3 characters.";
  if (trimmed.length > 80) return "Studio name must be at most 80 characters.";
  return null;
}

export function StudioSetupCard({ companyId, onComplete }: StudioSetupCardProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [exampleIdx] = useState(() => Math.floor(Math.random() * EXAMPLES.length));

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateStudioName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);

    try {
      await OnboardingService.saveStudioName(companyId, name.trim());

      // Emit analytics
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("studio_created"));
        window.dispatchEvent(new CustomEvent("onboarding_step_completed", { detail: { step: 1 } }));
      }

      setSaved(true);

      // Invalidate profile cache so sidebar/checklist refresh
      await queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });

      // Transition to checklist after a brief success moment
      setTimeout(() => {
        onComplete(name.trim());
      }, 1200);
    } catch (err) {
      console.error("[StudioSetup] Failed to save studio name:", err);
      toast.error("Could not save studio name. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const previewSlug = name.trim() ? generateSlug(name) : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="overflow-hidden border border-brand-900/10 bg-card shadow-[0_32px_80px_-40px_rgba(15,23,42,0.4)]">
        {/* Gradient header strip */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-rose-400 to-sky-400" />

        <div className="p-8 md:p-10">
          {saved ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-100">
                <Check className="h-7 w-7" strokeWidth={2.5} />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-accent">
                Studio Created
              </p>
              <h2 className="mt-3 font-serif text-3xl text-brand-900">
                Your workspace is ready.
              </h2>
              <p className="mt-3 text-sm text-brand-900/55">
                Setting up your onboarding checklist…
              </p>
            </div>
          ) : (
            /* ── Name input form ── */
            <>
              <div className="mb-8">
                <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-accent">
                  Welcome to Murra Studio
                </p>
                <h2 className="mt-3 font-serif text-3xl leading-tight text-brand-900 md:text-4xl">
                  Let's set up your<br />design studio.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-brand-900/55">
                  Give your workspace a name. You can always change this later in your profile.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-6">
                  <label
                    htmlFor="studio-name-input"
                    className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-brand-900/60"
                  >
                    Studio Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    ref={inputRef}
                    id="studio-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(validateStudioName(e.target.value));
                    }}
                    placeholder={EXAMPLES[exampleIdx]}
                    maxLength={80}
                    autoComplete="organization"
                    className={`w-full border bg-white/80 px-4 py-3.5 text-base text-brand-900 placeholder-brand-900/25 outline-none transition-colors focus:ring-2 focus:ring-accent/30 ${
                      error
                        ? "border-rose-400 focus:border-rose-400"
                        : "border-brand-900/15 focus:border-accent/50"
                    }`}
                  />

                  {/* Inline error */}
                  {error && (
                    <p className="mt-2 text-xs text-rose-500" role="alert">
                      {error}
                    </p>
                  )}

                  {/* Slug preview */}
                  {previewSlug && !error && (
                    <p className="mt-2 text-xs text-brand-900/40">
                      Workspace ID:{" "}
                      <span className="font-mono text-brand-900/55">{previewSlug}</span>
                    </p>
                  )}

                  {/* Examples hint */}
                  {!name && (
                    <p className="mt-3 text-xs text-brand-900/40">
                      e.g. {EXAMPLES.join(" · ")}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  id="studio-setup-continue-btn"
                  disabled={saving}
                  className="group relative w-full overflow-hidden bg-brand-900 py-3.5 text-[11px] font-medium uppercase tracking-[0.22em] text-brand-50 transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {saving ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Saving…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 opacity-70" />
                        Continue
                      </>
                    )}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
