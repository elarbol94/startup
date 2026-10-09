import { describe, expect, it } from "vitest";
import {
  daysBetween,
  networkMapConnections,
  networkMapDomain,
  networkMapHref,
  networkMapValue,
  parseNetworkMapParams,
  summarizeNetworkMap,
  type NetworkMapData,
  type NetworkMapPerson,
} from "./network-map";

const today = "2026-10-09";

function person(values: Partial<NetworkMapPerson> & { id: string }): NetworkMapPerson {
  return {
    name: values.id, role: "", organization: "", organizationId: null, visibility: "team", closeness: null,
    lastContactOn: null, reconnectDueOn: null, municipalityCode: null, activeLeads: 0, ...values,
  };
}

const data: NetworkMapData = {
  organizations: [
    { id: "tu", name: "TU Graz", municipalityCode: "60101" },
    { id: "gem", name: "Gemeinde Leoben", municipalityCode: "61108" },
  ],
  people: [
    // Lives in Graz and works there: counted once.
    person({ id: "anna", municipalityCode: "60101", organizationId: "tu", closeness: "close", lastContactOn: "2026-09-01", activeLeads: 2 }),
    // Lives in Trofaiach, works in Graz.
    person({ id: "bernd", municipalityCode: "61120", organizationId: "tu", closeness: "loose", lastContactOn: "2026-10-01", reconnectDueOn: "2026-10-05" }),
    // Lives in Trofaiach, never contacted, has a cadence.
    person({ id: "clara", municipalityCode: "61120", reconnectDueOn: "" }),
    // Nowhere on the map.
    person({ id: "dora" }),
  ],
  introductions: [{ contactId: "clara", targetCodes: ["61108", "61108"] }],
};

describe("summarizeNetworkMap", () => {
  const summary = summarizeNetworkMap(data, today);
  const byCode = Object.fromEntries(summary.map((entry) => [entry.code, entry]));

  it("counts a person once per municipality, at home and at work", () => {
    expect(summary.map((entry) => entry.code)).toEqual(["60101", "61108", "61120"]);
    expect(byCode["60101"].personIds).toEqual(["anna", "bernd"]);
    expect(byCode["60101"].residentIds).toEqual(["anna"]);
    expect(byCode["61120"].personIds).toEqual(["bernd", "clara"]);
  });

  it("keeps organisations without people", () => {
    expect(byCode["61108"]).toMatchObject({ personIds: [], organizationIds: ["gem"], closeness: null, lastContactOn: null });
  });

  it("averages closeness over people who have one", () => {
    expect(byCode["60101"].closeness).toBe(2);
    expect(byCode["61120"].closeness).toBe(1);
  });

  it("takes the newest last contact, counts due reconnects and active leads", () => {
    expect(byCode["60101"].lastContactOn).toBe("2026-10-01");
    expect(byCode["61120"].reconnectDue).toBe(2);
    expect(byCode["60101"].reconnectDue).toBe(1);
    expect(byCode["60101"].opportunities).toBe(2);
  });
});

describe("networkMapValue and networkMapDomain", () => {
  const [graz, leoben] = summarizeNetworkMap(data, today);

  it("turns each mode into a number or no data", () => {
    expect(networkMapValue(graz, "people", today)).toBe(2);
    expect(networkMapValue(graz, "recency", today)).toBe(8);
    expect(networkMapValue(leoben, "recency", today)).toBeNull();
    expect(networkMapValue(leoben, "closeness", today)).toBeNull();
    expect(networkMapValue(leoben, "opportunities", today)).toBe(0);
  });

  it("always has two distinct ends", () => {
    expect(networkMapDomain("people", [1, 1])).toEqual([1, 2]);
    expect(networkMapDomain("reconnect", [0, null])).toEqual([0, 1]);
    expect(networkMapDomain("opportunities", [3, 7])).toEqual([0, 7]);
    expect(networkMapDomain("closeness", [])).toEqual([1, 3]);
  });

  it("counts calendar days", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });
});

describe("networkMapConnections", () => {
  it("links where people live and work", () => {
    expect(networkMapConnections("61120", data)).toEqual([
      { code: "60101", people: 1, introductions: 0 },
      { code: "61108", people: 0, introductions: 1 },
    ]);
  });

  it("links introduction targets back to the introducer", () => {
    expect(networkMapConnections("61108", data)).toEqual([{ code: "61120", people: 0, introductions: 1 }]);
  });

  it("is empty for a municipality without links", () => {
    expect(networkMapConnections("99999", data)).toEqual([]);
  });
});

describe("map params", () => {
  it("moves the municipality into the selection and keeps the colour", () => {
    const params = parseNetworkMapParams({ municipality: "60101", color: "recency", tag: "t1", sort: "recent" });
    expect(params.municipalityCode).toBe("60101");
    expect(params.color).toBe("recency");
    expect(params.filter).toMatchObject({ tagId: "t1", municipalityCode: "", sort: "name" });
    expect(networkMapHref(params)).toBe("/network/map?tag=t1&municipality=60101&color=recency");
    expect(networkMapHref(params, { municipalityCode: "", color: "people" })).toBe("/network/map?tag=t1");
  });

  it("falls back to people for an unknown colour", () => {
    expect(parseNetworkMapParams({ color: "nope" }).color).toBe("people");
    expect(parseNetworkMapParams(null)).toMatchObject({ color: "people", municipalityCode: "" });
  });
});
