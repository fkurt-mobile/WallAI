import { useState } from "react";
import {
  Mail,
  MessageCircle,
  Facebook,
  Instagram,
  Link2,
  Check,
  Download,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";

// Pinterest isn't in lucide; use inline SVG
function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 5 3.1 9.3 7.5 11-.1-.9-.2-2.4 0-3.4.2-.9 1.4-5.7 1.4-5.7s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.5 2.6-5.5 5.3 0 1 .4 2.2.9 2.8.1.1.1.2.1.3-.1.4-.3 1.2-.3 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.4 8-7.4 4.2 0 7.4 3 7.4 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1-1 2.3-1.5 3.1.4.1.9.2 1.4.2 6.6 0 12-5.4 12-12S18.6 0 12 0Z" />
    </svg>
  );
}

export function SharePanel({
  title = "Share Visualization",
  shareUrl = typeof window !== "undefined" ? window.location.href : "",
}: {
  title?: string;
  shareUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  const platforms = [
    {
      name: "Email",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent("Wallpaper visualization")}&body=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: "Facebook",
      icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: "Instagram",
      icon: Instagram,
      href: "https://www.instagram.com/",
    },
    {
      name: "Pinterest",
      icon: PinIcon,
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}`,
    },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const downloadImage = async (format: "png" | "jpg") => {
    try {
      // Try fetching the image to download as blob
      const res = await fetch(shareUrl, { mode: "cors" });
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `visualization-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`Successfully downloaded ${format.toUpperCase()}`);
    } catch (err) {
      // Fallback: open in new tab if CORS blocks fetch
      toast.info("Opening image in new tab for download...");
      const a = document.createElement("a");
      a.href = shareUrl;
      a.target = "_blank";
      a.download = `visualization.${format}`;
      a.click();
    }
  };

  return (
    <div className="bg-card border border-brand-900/8 p-7 lg:p-8">
      <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-medium">Share</p>
      <h3 className="font-serif text-3xl italic mt-2 mb-1">{title}</h3>
      <p className="text-xs text-brand-900/55 mb-7">
        Send this preview to clients, colleagues, or save the link.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {platforms.map((p) => {
          const Icon = p.icon;
          return (
            <a
              key={p.name}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              title={`Share via ${p.name}`}
              className="group flex flex-col items-center justify-center text-center gap-2 py-5 px-2 border border-brand-900/10 rounded-md hover:border-accent hover:bg-accent/5 transition-colors min-w-0"
            >
              <Icon className="size-6 text-brand-900/70 group-hover:text-accent transition-colors shrink-0" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-brand-900/60 truncate max-w-full">
                {p.name}
              </span>
            </a>
          );
        })}
        <button
          onClick={copy}
          title="Copy link"
          className="group flex flex-col items-center justify-center text-center gap-2 py-5 px-2 border border-brand-900/10 rounded-md hover:border-accent hover:bg-accent/5 transition-colors min-w-0 cursor-pointer"
        >
          {copied ? (
            <Check className="size-6 text-accent shrink-0" />
          ) : (
            <LinkIcon className="size-6 text-brand-900/70 group-hover:text-accent transition-colors shrink-0" />
          )}
          <span className="text-[10px] uppercase tracking-[0.12em] text-brand-900/60 truncate max-w-full">
            {copied ? "Copied" : "Copy Link"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 border border-brand-900/12 px-3 py-2.5 mb-7 bg-brand-50/40">
        <Link2 className="size-3.5 text-brand-900/40 shrink-0" />
        <span className="truncate text-brand-900/55 font-mono text-[11px] min-w-0 flex-1">
          {shareUrl || "share-link"}
        </span>
      </div>

      <div className="h-px bg-brand-900/8 mb-6" />

      <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/45 mb-3">Download</p>
      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={() => downloadImage("png")}
          className="flex items-center justify-center gap-2 bg-brand-900 text-brand-50 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-800 transition-colors cursor-pointer"
        >
          <Download className="size-3.5" /> PNG
        </button>
        <button 
          onClick={() => downloadImage("jpg")}
          className="flex items-center justify-center gap-2 border border-brand-900/15 py-3 text-[11px] uppercase tracking-[0.18em] hover:bg-brand-50 transition-colors cursor-pointer"
        >
          <Download className="size-3.5" /> JPG
        </button>
      </div>
    </div>
  );
}

