/** `ids` with `id` moved one place up (-1) or down (+1); the same list when it can't move. */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const order = [...ids];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}

/** Whether two orders list the same ids in the same places. */
export function isSameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
