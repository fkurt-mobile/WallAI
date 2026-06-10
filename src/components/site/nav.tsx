import { Link } from "@tanstack/react-router";

export function SiteNav({ variant = "transparent" }: { variant?: "transparent" | "solid" }) {
  return (
    <nav
      className={
        "sticky top-0 z-40 w-full border-b border-brand-900/5 backdrop-blur-md " +
        (variant === "solid" ? "bg-card/95" : "bg-brand-50/80")
      }
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="text-2xl font-serif italic tracking-tight text-brand-900">
          Murra.
        </Link>
        <div />
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            to="/auth"
            className="hidden md:inline text-sm font-medium hover:text-accent transition-colors"
          >
            Login
          </Link>
          <Link
            to="/auth"
            className="bg-brand-900 text-brand-50 px-5 py-2.5 text-xs font-medium uppercase tracking-widest hover:bg-brand-800 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
