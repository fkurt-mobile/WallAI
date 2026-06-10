import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import heroRoom from "@/assets/hero-room.jpg";

export function AuthShell({
  kicker,
  title,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-brand-50">
      <div className="flex flex-col p-8 lg:p-14">
        <Link to="/" className="text-2xl font-serif italic text-brand-900">
          Murra.
        </Link>
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-sm">
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
              {kicker}
            </span>
            <h1 className="font-serif text-5xl mt-3 mb-10">{title}</h1>
            {children}
            <div className="mt-8 text-sm text-brand-900/60">{footer}</div>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/30">© 2026 Murra</p>
      </div>
      <div className="hidden lg:block relative">
        <img src={heroRoom} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900/40 to-transparent" />
        <div className="absolute bottom-14 left-14 right-14 text-brand-50">
          <p className="font-serif text-3xl italic leading-tight">
            "Murra changed the way our showroom sells. Every pattern, every wall — instantly."
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.2em] opacity-70">
            Anna Lindqvist — Heim Studio
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block mb-5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/60 mb-2 block">
        {label}
      </span>
      <input
        {...props}
        className="w-full bg-transparent border-b border-brand-900/15 py-3 text-base focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}

export function AuthButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full bg-brand-900 text-brand-50 py-4 text-[11px] uppercase tracking-[0.2em] font-medium hover:bg-brand-800 transition-colors disabled:opacity-60"
    >
      {children}
    </button>
  );
}
