/** Assign overlapping visual intervals to separate columns, including short events. */
export function layoutEventColumns<T extends { id: string; start: number; end: number }>(events: T[]) {
  const result = new Map<string, { column: number; columns: number }>();
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  let group: T[] = [];
  let groupEnd = -Infinity;
  function flush() {
    const ends: number[] = [];
    for (const event of group) {
      let column = ends.findIndex((end) => end <= event.start);
      if (column < 0) column = ends.length;
      ends[column] = event.end;
      result.set(event.id, { column, columns: 0 });
    }
    for (const event of group) result.get(event.id)!.columns = ends.length;
  }
  for (const event of sorted) {
    if (event.start >= groupEnd) {
      flush();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end);
  }
  flush();
  return result;
}
