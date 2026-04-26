export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function shortTag(tag: string | null): string {
  if (!tag) return "—";
  const [name, ref] = tag.split(":");
  if (!ref) return tag;
  return `${name}:${ref.slice(0, 12)}`;
}
