export function matchesOverviewFilters(values: Record<string, string>, row: Record<string, string | null | undefined>) {
  return Object.entries(values).every(([key, value]) => !value || (key === "search" ? (row.search ?? "").toLocaleLowerCase().includes(value.toLocaleLowerCase()) : key === "from" ? !!row.date && row.date >= value : key === "to" ? !!row.date && row.date <= value : row[key] === value));
}
