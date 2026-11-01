/** `ids` with `id` moved one place up (-1) or down (+1). */
export function shifted(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  return swap(ids, from, to);
}

interface Kinded {
  id: string;
  kind: string;
}

/**
 * The ids with `id` swapped with the nearest item of the same kind above (-1) or below (+1).
 * Category groups are listed sectioned by type, so this is "one place up" within a section.
 */
export function shiftedAmongKind(items: Kinded[], id: string, delta: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const kind = items[from]!.kind;
  for (let to = from + delta; to >= 0 && to < items.length; to += delta) {
    if (items[to]!.kind === kind) return swap(ids, from, to);
  }
  return ids;
}

function swap(ids: string[], from: number, to: number): string[] {
  const order = [...ids];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}
