export function getSiteBaseUrl(): string {
  // Prefer an explicit configured base URL, but fall back to Vercel's runtime URL.
  // Note: This function intentionally avoids calling next/headers() so it won't
  // accidentally force dynamic rendering for server components.
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

