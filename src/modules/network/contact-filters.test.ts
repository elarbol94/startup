import { describe, expect, it } from "vitest";
import {
  compareContacts,
  defaultContactListFilter,
  isContactListFiltered,
  networkFilterHref,
  parseContactListParams,
  type SortableContact,
} from "./contact-filters";

describe("parseContactListParams", () => {
  it("returns the defaults for no params", () => {
    expect(parseContactListParams({})).toEqual(defaultContactListFilter);
    expect(parseContactListParams(undefined)).toEqual(defaultContactListFilter);
  });

  it("reads every filter", () => {
    expect(parseContactListParams({
      q: "  Graz ", tag: "t1", relationship: "friend", closeness: "close", scope: "mine",
      organization: "o1", municipality: "61120", sort: "lastContact",
    })).toEqual({
      query: "Graz", tagId: "t1", relationship: "friend", closeness: "close", scope: "mine",
      organizationId: "o1", municipalityCode: "61120", sort: "lastContact",
    });
  });

  it("falls back instead of failing on unknown or malformed values", () => {
    expect(parseContactListParams({
      relationship: "enemy", closeness: "", scope: "everyone", municipality: "6112", sort: "random", tag: "",
    })).toEqual(defaultContactListFilter);
    expect(parseContactListParams({ organization: "x".repeat(101), municipality: "61120a" })).toEqual(defaultContactListFilter);
  });

  it("uses the first of repeated params", () => {
    expect(parseContactListParams({ tag: ["a", "b"], sort: ["recent", "name"], scope: ["bogus", "team"] }))
      .toMatchObject({ tagId: "a", sort: "recent", scope: "all" });
  });

  it("caps the search text", () => {
    expect(parseContactListParams({ q: "a".repeat(500) }).query).toHaveLength(200);
  });
});

describe("isContactListFiltered", () => {
  it("ignores the sort order", () => {
    expect(isContactListFiltered({ ...defaultContactListFilter, sort: "recent" })).toBe(false);
    expect(isContactListFiltered({ ...defaultContactListFilter, scope: "team" })).toBe(true);
    expect(isContactListFiltered({ ...defaultContactListFilter, query: "x" })).toBe(true);
  });
});

describe("networkFilterHref", () => {
  const current = { ...defaultContactListFilter, query: "graz", tagId: "t1", sort: "recent" as const };

  it("keeps other params and applies the patch in a stable order", () => {
    expect(networkFilterHref(current, { closeness: "close" })).toBe("/network?q=graz&tag=t1&closeness=close&sort=recent");
    expect(networkFilterHref(current, { municipalityCode: "61120", scope: "mine" }))
      .toBe("/network?q=graz&tag=t1&scope=mine&municipality=61120&sort=recent");
  });

  it("removes cleared values and defaults", () => {
    expect(networkFilterHref(current, { tagId: "" })).toBe("/network?q=graz&sort=recent");
    expect(networkFilterHref(current, { query: "", tagId: "", sort: "name" })).toBe("/network");
    expect(networkFilterHref({ ...defaultContactListFilter, scope: "all" })).toBe("/network");
  });

  it("encodes values", () => {
    expect(networkFilterHref(defaultContactListFilter, { query: "a&b c" })).toBe("/network?q=a%26b+c");
  });

  it("round-trips through the parser", () => {
    const filter = { ...current, relationship: "event" as const, organizationId: "o 1" };
    const params = new URLSearchParams(networkFilterHref(filter).split("?")[1]);
    expect(parseContactListParams(Object.fromEntries(params))).toEqual(filter);
  });
});

describe("compareContacts", () => {
  const contact = (id: string, name: string, lastContactOn: string | null, created: string, reconnectEveryDays: number | null = null): SortableContact =>
    ({ id, name, lastContactOn, reconnectEveryDays, createdAt: new Date(created) });
  const contacts = [
    contact("4", "Zoe", null, "2026-01-04", 30),
    contact("3", "Ärne", "2026-05-01", "2026-01-01", 30),
    contact("2", "anna", "2026-03-01", "2026-01-03", 90),
    contact("1", "Anna", "2026-03-01", "2026-01-03", 90),
    contact("5", "Bert", null, "2026-01-02"),
  ];
  const order = (sort: Parameters<typeof compareContacts>[0]) =>
    [...contacts].sort(compareContacts(sort)).map((item) => item.id);

  it("sorts by name ignoring case and accents, then by id", () => {
    expect(order("name")).toEqual(["1", "2", "3", "5", "4"]);
  });

  it("sorts by last contact, newest first, without a date last", () => {
    expect(order("lastContact")).toEqual(["3", "1", "2", "5", "4"]);
  });

  it("sorts by creation, newest first", () => {
    expect(order("recent")).toEqual(["4", "1", "2", "5", "3"]);
  });

  it("sorts by reconnect: never contacted first, then due date, without a cadence last", () => {
    // Zoe: never contacted; Anna/anna due 2026-05-30 (tie → name, id); Ärne due 2026-05-31; Bert: no cadence.
    expect(order("reconnect")).toEqual(["4", "1", "2", "3", "5"]);
  });
});
