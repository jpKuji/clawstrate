"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      router.push(`/?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <Input
        type="search"
        placeholder="Search actions..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
      />
    </form>
  );
}
