import { describe, expect, it } from "vitest";
import { compareLeads, editDistance, isLeadOverdue, matchesSearch, normalizeText, parseTagInput, rankSuggestions } from "./network-utils";

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

describe("suggestions", () => {
  const known = [
    { value: "Förderung", count: 5 },
    { value: "Design", count: 3 },
    { value: "Gemeinden", count: 2 },
    { value: "Grafikdesign", count: 1 },
    { value: "Geburtstagsparty Bernd Keuschnig", count: 1 },
  ];
  const values = (list: { value: string }[]) => list.map((entry) => entry.value);

  it("offers everything in the given order when nothing is typed, minus what is already chosen", () => {
    expect(values(rankSuggestions(known, "", { exclude: ["design"] }).matches)).toEqual(["Förderung", "Gemeinden", "Grafikdesign", "Geburtstagsparty Bernd Keuschnig"]);
  });

  it("ranks exact, prefix, word start and substring matches, ignoring case and accents", () => {
    expect(values(rankSuggestions(known, "design").matches)).toEqual(["Design", "Grafikdesign"]);
    expect(values(rankSuggestions(known, "ge").matches)).toEqual(["Gemeinden", "Geburtstagsparty Bernd Keuschnig"]);
    expect(values(rankSuggestions(known, "bernd").matches)).toEqual(["Geburtstagsparty Bernd Keuschnig"]);
    expect(rankSuggestions(known, "FORDERUNG").exact?.value).toBe("Förderung");
  });

  it("suggests close matches for typos only when nothing matches", () => {
    const typo = rankSuggestions(known, "Förderug");
    expect(typo.matches).toEqual([]);
    expect(values(typo.closest)).toEqual(["Förderung"]);
    expect(rankSuggestions(known, "Gemiende").closest.map((entry) => entry.value)).toEqual(["Gemeinden"]);
    expect(rankSuggestions(known, "xyz").closest).toEqual([]);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});
