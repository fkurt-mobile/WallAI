import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Murra" }] }),
  component: Profile,
});

function Profile() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
        <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
          Account
        </span>
        <h1 className="font-serif text-5xl mt-3 mb-12">Profile.</h1>
        <div className="flex items-center gap-6 mb-12">
          <div className="size-20 rounded-full bg-gilded text-brand-50 grid place-items-center font-serif text-3xl">
            A
          </div>
          <div>
            <p className="font-serif text-2xl">Anna Lindqvist</p>
            <p className="text-sm text-brand-900/50">anna@heimstudio.se · Heim Studio</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-brand-900/5">
          <div className="bg-card p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Plan</p>
            <p className="font-serif text-3xl mt-2">Professional</p>
          </div>
          <div className="bg-card p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Member since</p>
            <p className="font-serif text-3xl mt-2">2026</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
