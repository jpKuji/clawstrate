"use client";

import { useState } from "react";
import { List, X } from "lucide-react";

interface MobileSectionNavProps {
  sections: Array<{ id: string; title: string }>;
  activeId: string;
}

export function MobileSectionNav({ sections, activeId }: MobileSectionNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (sections.length === 0) return null;

  return (
    <div className="lg:hidden fixed bottom-6 right-6 z-50">
      {/* Popover */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 w-[calc(100vw-4rem)] sm:w-64 max-h-[60vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-sm p-3 shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2 px-2">
            Sections
          </p>
          <nav className="space-y-0.5">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setIsOpen(false)}
                className={`block rounded-lg px-2 py-2 text-sm transition-colors ${
                  activeId === section.id
                    ? "bg-zinc-800/80 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`}
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex size-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm text-zinc-300 shadow-lg hover:bg-zinc-800 transition-colors"
        aria-label={isOpen ? "Close section navigation" : "Open section navigation"}
      >
        {isOpen ? <X className="size-5" /> : <List className="size-5" />}
      </button>
    </div>
  );
}
