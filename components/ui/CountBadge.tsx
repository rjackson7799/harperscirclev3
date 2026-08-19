/**
 * The count badge (§8.4): terracotta badge fill (the Q2 badge variant —
 * white on it holds AA at 700 10.5px), 1px 7px, pill radius. Counts stay
 * plain prose next to it (§8.6); the badge is the number, nothing else.
 */
export function CountBadge({ count }: { count: number }) {
  return <span className="badge count-badge">{count}</span>;
}
