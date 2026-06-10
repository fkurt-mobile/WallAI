import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="bg-brand-50 border-t border-brand-900/5 px-6 lg:px-10 py-20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
        <div className="max-w-xs">
          <div className="text-3xl font-serif italic mb-6 text-brand-900">Murra.</div>
          <p className="text-sm text-brand-900/50 leading-relaxed">
            Defining the future of interior design retail through advanced computer vision and
            immersive visualization.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
          <FooterCol
            title="Platform"
            links={[
              ["For Manufacturers", "/"],
              ["For Retailers", "/"],
              ["API Access", "/"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["Our Story", "/"],
              ["Journal", "/"],
              ["Contact", "/"],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ["Privacy", "/"],
              ["Terms", "/"],
              ["Cookies", "/"],
            ]}
          />
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-brand-900/5 flex justify-between items-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-brand-900/30">
          © 2026 Murra Visualization Lab
        </p>
        <div className="flex gap-3">
          <div className="size-2 rounded-full bg-gilded" />
          <div className="size-2 rounded-full bg-brand-900/10" />
          <div className="size-2 rounded-full bg-brand-900/10" />
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 text-brand-900">
        {title}
      </h4>
      <ul className="space-y-4 text-sm text-brand-900/70">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link to={href} className="hover:text-accent transition-colors">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
