import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, AuthField, AuthButton } from "@/components/site/auth-shell";

const searchSchema = z.object({ redirect: z.string().optional() });
const MIN_PASSWORD_LENGTH = 8;

type AuthFeedback = {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Murra" },
      { name: "description", content: "Sign in or create your Murra Studio account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);

  function showFeedback(nextFeedback: AuthFeedback) {
    setFeedback(nextFeedback);
    emitAuthToast(nextFeedback);
  }

  // If already signed in, bounce to dashboard / redirect target
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive && data.user) {
        navigate({ to: redirect ?? "/dashboard", replace: true });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: redirect ?? "/dashboard", replace: true });
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, redirect]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    const validationMessage = validateEmailAuthForm(cleanEmail, password, mode);
    if (validationMessage) {
      showFeedback({
        type: "error",
        title: "Check your details",
        message: validationMessage,
      });
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;

        const confirmationRequired = !data.session;
        if (confirmationRequired) {
          showFeedback({
            type: "success",
            title: "Check your email",
            message: `We sent a confirmation link to ${cleanEmail}. Confirm your email before signing in.`,
            action: {
              label: "Resend confirmation",
              onClick: () => void handleResendConfirmation(cleanEmail),
            },
          });
          setMode("signin");
          setPassword("");
        } else {
          showFeedback({
            type: "success",
            title: "Account created",
            message: "Your account is ready. Redirecting you to the dashboard.",
          });
        }
      }
    } catch (err) {
      const nextFeedback = mapSupabaseAuthError(err, mode, cleanEmail);
      if (nextFeedback.title === "Confirm your email first") {
        nextFeedback.action = {
          label: "Resend confirmation",
          onClick: () => void handleResendConfirmation(cleanEmail),
        };
      }
      showFeedback(nextFeedback);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setFeedback(null);
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/auth${
        redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
      }`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (!data.url) {
        showFeedback({
          type: "error",
          title: "Google sign-in failed",
          message: "Supabase did not return an OAuth URL. Check the Google provider setup.",
        });
        setLoading(false);
        return;
      }

      const preflightError = await getGoogleOAuthConfigurationError(data.url);
      if (preflightError) {
        showFeedback(preflightError);
        setLoading(false);
        return;
      }

      window.location.assign(data.url);
    } catch (err) {
      showFeedback(mapSupabaseAuthError(err, "oauth", email.trim().toLowerCase()));
      setLoading(false);
    }
  }

  async function handleResendConfirmation(targetEmail = email.trim().toLowerCase()) {
    if (!targetEmail) {
      showFeedback({
        type: "error",
        title: "Email required",
        message: "Enter your email address so we can resend the confirmation link.",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: targetEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });

    if (error) {
      showFeedback(mapSupabaseAuthError(error, "resend", targetEmail));
    } else {
      showFeedback({
        type: "success",
        title: "Confirmation email sent",
        message: `We sent a new confirmation link to ${targetEmail}.`,
      });
    }
    setLoading(false);
  }

  const isSignin = mode === "signin";
  return (
    <AuthShell
      kicker={isSignin ? "Welcome back" : "Create your studio"}
      title={isSignin ? "Sign in." : "Sign up."}
      footer={
        isSignin ? (
          <>
            No account?{" "}
            <button
              onClick={() => {
                setMode("signup");
                setFeedback(null);
              }}
              className="text-accent"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already a member?{" "}
            <button
              onClick={() => {
                setMode("signin");
                setFeedback(null);
              }}
              className="text-accent"
            >
              Sign in
            </button>
          </>
        )
      }
    >
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full mb-6 border border-brand-900/15 py-3 text-sm font-medium hover:bg-card transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      <div className="flex items-center gap-3 mb-6">
        <span className="flex-1 h-px bg-brand-900/10" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">or email</span>
        <span className="flex-1 h-px bg-brand-900/10" />
      </div>
      {feedback && <AuthFeedbackPanel feedback={feedback} />}
      <form onSubmit={handleEmailSubmit}>
        <AuthField
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete={isSignin ? "current-password" : "new-password"}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {!isSignin && (
          <p className="-mt-3 mb-5 text-xs leading-relaxed text-brand-900/45">
            Use at least {MIN_PASSWORD_LENGTH} characters. A mix of letters, numbers, and symbols is
            recommended.
          </p>
        )}
        <div className="mb-6" />
        <AuthButton disabled={loading}>
          {loading ? "Please wait…" : isSignin ? "Sign In" : "Create Account"}
        </AuthButton>
      </form>
      <p className="mt-6 text-[11px] text-brand-900/40">
        <Link to="/">← Back to home</Link>
      </p>
    </AuthShell>
  );
}

function emitAuthToast(feedback: AuthFeedback) {
  if (feedback.type === "error") toast.error(feedback.title, { description: feedback.message });
  if (feedback.type === "success") toast.success(feedback.title, { description: feedback.message });
  if (feedback.type === "warning") toast.warning(feedback.title, { description: feedback.message });
  if (feedback.type === "info") toast.info(feedback.title, { description: feedback.message });
}

function AuthFeedbackPanel({ feedback }: { feedback: AuthFeedback }) {
  const styleByType = {
    success: "border-emerald-700/20 bg-emerald-50 text-emerald-950",
    error: "border-destructive/25 bg-destructive/5 text-destructive",
    warning: "border-amber-700/25 bg-amber-50 text-amber-950",
    info: "border-brand-900/15 bg-card text-brand-900",
  } satisfies Record<AuthFeedback["type"], string>;

  return (
    <div
      role={feedback.type === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`mb-6 border px-4 py-3 text-sm leading-relaxed ${styleByType[feedback.type]}`}
    >
      <p className="font-medium">{feedback.title}</p>
      <p className="mt-1 opacity-80">{feedback.message}</p>
      {feedback.action && (
        <button
          type="button"
          onClick={feedback.action.onClick}
          className="mt-3 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
        >
          {feedback.action.label}
        </button>
      )}
    </div>
  );
}

function validateEmailAuthForm(email: string, password: string, mode: "signin" | "signup") {
  if (!email) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (!password) return "Enter your password.";
  if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
    return `Create a stronger password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

async function getGoogleOAuthConfigurationError(url: string): Promise<AuthFeedback | null> {
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    if (response.ok || response.status === 0 || response.status >= 300) return null;

    const body = await response
      .clone()
      .json()
      .catch(() => null);
    const message = typeof body?.msg === "string" ? body.msg : "";
    if (message.toLowerCase().includes("missing oauth secret")) {
      return {
        type: "error",
        title: "Google sign-in is not configured",
        message: `Supabase project ${getSupabaseProjectIdFromUrl(url) ?? "for this app"} is missing the Google OAuth client secret. Add the Google Client ID and Client Secret in Supabase Authentication → Providers → Google.`,
      };
    }

    return {
      type: "error",
      title: "Google sign-in failed",
      message: message || "Supabase rejected the Google sign-in request. Check provider settings.",
    };
  } catch {
    return null;
  }
}

function mapSupabaseAuthError(
  err: unknown,
  context: "signin" | "signup" | "oauth" | "resend",
  email: string,
): AuthFeedback {
  const rawMessage = err instanceof Error ? err.message : "Something went wrong.";
  const code =
    typeof err === "object" && err !== null && "code" in err ? String(err.code) : undefined;
  const status =
    typeof err === "object" && err !== null && "status" in err ? Number(err.status) : undefined;
  const message = rawMessage.toLowerCase();

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return {
      type: "warning",
      title: "Confirm your email first",
      message: `We need you to confirm ${email || "your email"} before signing in.`,
    };
  }

  if (
    code === "weak_password" ||
    message.includes("weak password") ||
    message.includes("password should")
  ) {
    return {
      type: "error",
      title: "Password is too weak",
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters. Include a mix of letters, numbers, and symbols for best results.`,
    };
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return {
      type: "error",
      title: "Incorrect email or password",
      message: "Check your email and password, then try again.",
    };
  }

  if (message.includes("already registered") || message.includes("user already registered")) {
    return {
      type: "warning",
      title: "Account already exists",
      message: "This email is already registered. Switch to sign in instead.",
    };
  }

  if (status === 422 || message.includes("unable to validate email address")) {
    return {
      type: "error",
      title: "Email could not be used",
      message: "Use a real email address that can receive confirmation messages.",
    };
  }

  if (status === 429 || message.includes("rate limit") || message.includes("too many")) {
    return {
      type: "warning",
      title: "Too many attempts",
      message: "Wait a minute before trying again.",
    };
  }

  if (message.includes("missing oauth secret")) {
    return {
      type: "error",
      title: "Google sign-in is not configured",
      message:
        "Supabase is missing the Google OAuth client secret. Add the Google Client ID and Client Secret in Supabase Authentication → Providers → Google.",
    };
  }

  if (message.includes("fetch") || message.includes("network")) {
    return {
      type: "error",
      title: "Network problem",
      message: "We could not reach the auth server. Check your connection and try again.",
    };
  }

  return {
    type: "error",
    title:
      context === "oauth"
        ? "Google sign-in failed"
        : context === "signup"
          ? "Could not create account"
          : context === "resend"
            ? "Could not resend confirmation"
            : "Could not sign in",
    message: rawMessage,
  };
}

function getSupabaseProjectIdFromUrl(url: string) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return undefined;
  }
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
