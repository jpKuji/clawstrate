import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageContainer({
  children,
  title,
  description,
  backHref,
  backLabel,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      {(title || backHref) && (
        <div className="mb-6">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
            >
              <ArrowLeft className="size-3" />
              {backLabel || "Back"}
            </Link>
          )}
          {title && (
            <div className="border border-zinc-800 bg-zinc-900">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <h1 className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                  {title}
                </h1>
              </div>
              {description && (
                <div className="px-4 py-1.5 border-t border-zinc-800/50">
                  <p className="text-[10px] text-zinc-500">{description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
