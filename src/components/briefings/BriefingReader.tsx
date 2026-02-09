"use client";

import ReactMarkdown from "react-markdown";

export function BriefingReader({ content }: { content: string }) {
  return (
    <article className="prose prose-invert prose-zinc max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
