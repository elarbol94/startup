import { expect, it } from "vitest";
import { matchesOverviewFilters } from "./overview-filter-model";
it("combines search, exact choices and inclusive dates", () => {
 const row = { search: "Design Review", calendar: "team", date: "2026-09-10", status: "unread" };
 expect(matchesOverviewFilters({ search: "review", calendar: "team", from: "2026-09-10", to: "2026-09-10", status: "unread" }, row)).toBe(true);
 expect(matchesOverviewFilters({ calendar: "private" }, row)).toBe(false);
 expect(matchesOverviewFilters({ to: "2026-09-09" }, row)).toBe(false);
 expect(matchesOverviewFilters({ from: "2026-09-11" }, row)).toBe(false);
 expect(matchesOverviewFilters({ status: "read" }, row)).toBe(false);
});
it("excludes undated records only when a date filter is selected", () => {
 expect(matchesOverviewFilters({ from: "2026-09-10" }, { date: null })).toBe(false);
 expect(matchesOverviewFilters({ from: "", search: "" }, { date: null })).toBe(true);
});
