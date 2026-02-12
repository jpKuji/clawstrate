export function normalizeTopicNameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyTopicName(name: string): string {
  const key = normalizeTopicNameKey(name);
  const slug = key
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return slug || "topic";
}

