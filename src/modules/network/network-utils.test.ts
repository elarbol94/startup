import { describe, expect, it } from "vitest";
import { compareLeads, isLeadOverdue, matchesSearch, normalizeText, parseTagInput } from "./network-utils";

describe("tags", () => {
  it("splits, trims and de-duplicates case- and accent-insensitively", () => {
    expect(parseTagInput(" Design, förderung ,design; #Förderung\nGemeinden, ")).toEqual(["Design", "förderung", "Gemeinden"]);
  });

  it("normalizes umlauts and whitespace for uniqueness", () => {
    expect(normalizeText("  Förder   Landschaft ")).toBe("forder landschaft");
  });
});

describe("search", () => {
  it("requires every word somewhere across the fields, ignoring accents", () => {
    const fields = ["Sebastian", "Kennt jemanden beim Klimabündnis Österreich"];
    expect(matchesSearch("klimabundnis sebastian", fields)).toBe(true);
    expect(matchesSearch("osterreich design", fields)).toBe(false);
    expect(matchesSearch("  ", fields)).toBe(true);
  });
});

describe("leads", () => {
  const lead = (status: "open" | "asked" | "done" | "dropped", dueOn: string | null, created = 0) => ({ status, dueOn, createdAt: new Date(created) });

  it("is overdue only while still active", () => {
    expect(isLeadOverdue(lead("open", "2026-09-01"), "2026-09-27")).toBe(true);
    expect(isLeadOverdue(lead("asked", "2026-09-27"), "2026-09-27")).toBe(false);
    expect(isLeadOverdue(lead("done", "2026-09-01"), "2026-09-27")).toBe(false);
  });

  it("sorts active leads first, by due date with undated last, then newest", () => {
    const leads = [
      { ...lead("done", "2026-01-01"), id: "done" },
      { ...lead("open", null, 1), id: "undated-old" },
      { ...lead("open", null, 2), id: "undated-new" },
      { ...lead("asked", "2026-10-02"), id: "later" },
      { ...lead("open", "2026-10-01"), id: "sooner" },
    ];
    expect(leads.sort(compareLeads).map((item) => item.id)).toEqual(["sooner", "later", "undated-new", "undated-old", "done"]);
  });
});
