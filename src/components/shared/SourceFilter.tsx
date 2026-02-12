"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { SourceDisplayConfig } from "@/lib/sources/display";

export function SourceFilter({
  sourceDisplayList,
}: {
  sourceDisplayList: SourceDisplayConfig[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const current = searchParams.get("source") ?? "all";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("source");
    } else {
      params.set("source", value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="h-9 w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
    >
      <option value="all">All sources</option>
      {sourceDisplayList.map((s) => (
        <option key={s.id} value={s.id}>
          {s.displayName}
        </option>
      ))}
    </select>
  );
}
