import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Murra" }] }),
  component: Profile,
});

function Profile() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
          <p className="text-center font-serif text-2xl italic py-20">Loading profile...</p>
        </div>
      </AppShell>
    );
  }

  const fullName = profile?.full_name || "Anna Lindqvist";
  const email = profile?.email || "anna@heimstudio.se";
  const companyName = (profile?.companies as any)?.name || "Heim Studio";
  const initial = fullName ? fullName[0].toUpperCase() : "A";
  const roleDisplay = 
    profile?.role === "platform_admin" ? "Platform Admin" :
    profile?.role === "company_admin" ? "Company Admin" :
    "Company User";
  
  const memberSince = profile?.created_at 
    ? new Date(profile.created_at).getFullYear()
    : 2026;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
        <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
          Account
        </span>
        <h1 className="font-serif text-5xl mt-3 mb-12">Profile.</h1>
        <div className="flex items-center gap-6 mb-12">
          <div className="size-20 rounded-full bg-gilded text-brand-50 grid place-items-center font-serif text-3xl">
            {initial}
          </div>
          <div>
            <p className="font-serif text-2xl">{fullName}</p>
            <p className="text-sm text-brand-900/50">{email} · {companyName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-brand-900/5">
          <div className="bg-card p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Role</p>
            <p className="font-serif text-3xl mt-2">{roleDisplay}</p>
          </div>
          <div className="bg-card p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Member since</p>
            <p className="font-serif text-3xl mt-2">{memberSince}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

