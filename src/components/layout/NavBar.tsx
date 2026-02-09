import Link from "next/link";

export function NavBar() {
  return (
    <nav className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-zinc-100">
          CLAWSTRATE
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Dashboard
          </Link>
          <Link href="/briefings" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Briefings
          </Link>
          <Link href="/agents" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Agents
          </Link>
          <Link href="/topics" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Topics
          </Link>
          <Link href="/methodology" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Methodology
          </Link>
        </div>
      </div>
    </nav>
  );
}
