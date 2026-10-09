// The network map ("Karte"): which municipalities the visible network reaches, what to colour them
// by and how they connect. Pure (no DB imports), shared by the query, the page and the map client.
import { z } from "zod";
import type { ContactCloseness } from "./constants";
import { networkFilterHref, parseContactListParams, type ContactListFilter } from "./contact-filters";

/** What the municipalities are coloured by; circles always show the number of people. */
export const networkMapColorModes = ["people", "closeness", "recency", "reconnect", "opportunities"] as const;
export type NetworkMapColorMode = (typeof networkMapColorModes)[number];

export type NetworkMapPerson = {
  id: string;
  name: string;
  role: string;
  organization: string;
  organizationId: string | null;
  visibility: "private" | "team";
  closeness: ContactCloseness | null;
  lastContactOn: string | null;
  /** Only for the viewer's own contacts, like the reminders; "" means never contacted. */
  reconnectDueOn: string | null;
  /** Where the person lives (Gemeindekennziffer). */
  municipalityCode: string | null;
  activeLeads: number;
};

export type NetworkMapOrganization = { id: string; name: string; municipalityCode: string };

/** An active lead of a person on the map, with where its target (person or organisation) is. */
export type NetworkMapIntroduction = { contactId: string; targetCodes: string[] };

export type NetworkMapData = {
  people: NetworkMapPerson[];
  /** Visible organisations that have a municipality. */
  organizations: NetworkMapOrganization[];
  introductions: NetworkMapIntroduction[];
};

export type NetworkMapMunicipality = {
  code: string;
  /** People living here. */
  residentIds: string[];
  /** Organisations located here. */
  organizationIds: string[];
  /** Everyone counted here, living here or at an organisation here, once each. */
  personIds: string[];
  /** Mean closeness (loose 1, known 2, close 3) of the people with one; null if none has one. */
  closeness: number | null;
  /** Newest last contact of the people here. */
  lastContactOn: string | null;
  /** The viewer's own contacts here whose keep-in-touch date has come. */
  reconnectDue: number;
  /** Active leads of the people here. */
  opportunities: number;
};

const closenessScore: Record<ContactCloseness, number> = { loose: 1, known: 2, close: 3 };

/** Where a person shows up on the map: their home and their organisation's municipality. */
export function personLocations(person: NetworkMapPerson, organizationCodes: Map<string, string>) {
  const work = person.organizationId ? organizationCodes.get(person.organizationId) : undefined;
  return [...new Set([person.municipalityCode, work].filter((code): code is string => Boolean(code)))];
}

function organizationCodeMap(organizations: NetworkMapOrganization[]) {
  return new Map(organizations.map((organization) => [organization.id, organization.municipalityCode]));
}

/** One entry per municipality with people or organisations, sorted by code. */
export function summarizeNetworkMap(data: NetworkMapData, today: string): NetworkMapMunicipality[] {
  const organizationCodes = organizationCodeMap(data.organizations);
  const entries = new Map<string, { residents: string[]; organizations: string[]; people: NetworkMapPerson[] }>();
  const entry = (code: string) =>
    entries.get(code) ?? entries.set(code, { residents: [], organizations: [], people: [] }).get(code)!;
  for (const organization of data.organizations) entry(organization.municipalityCode).organizations.push(organization.id);
  for (const person of data.people) {
    if (person.municipalityCode) entry(person.municipalityCode).residents.push(person.id);
    for (const code of personLocations(person, organizationCodes)) entry(code).people.push(person);
  }
  return [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, { residents, organizations, people }]) => {
      const scores = people.flatMap((person) => (person.closeness ? [closenessScore[person.closeness]] : []));
      const lastContacts = people.flatMap((person) => (person.lastContactOn ? [person.lastContactOn] : [])).sort();
      return {
        code,
        residentIds: residents,
        organizationIds: organizations,
        personIds: people.map((person) => person.id),
        closeness: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
        lastContactOn: lastContacts.at(-1) ?? null,
        reconnectDue: people.filter((person) => person.reconnectDueOn !== null && person.reconnectDueOn <= today).length,
        opportunities: people.reduce((sum, person) => sum + person.activeLeads, 0),
      };
    });
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  const parse = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** The value a municipality is coloured by; null means "no data" (drawn grey). */
export function networkMapValue(municipality: NetworkMapMunicipality, mode: NetworkMapColorMode, today: string): number | null {
  switch (mode) {
    case "people":
      return municipality.personIds.length;
    case "closeness":
      return municipality.closeness;
    case "recency":
      return municipality.lastContactOn ? Math.max(0, daysBetween(municipality.lastContactOn, today)) : null;
    case "reconnect":
      return municipality.reconnectDue;
    case "opportunities":
      return municipality.opportunities;
  }
}

/** Colour scale range; never empty, so the ramp always has two distinct ends. */
export function networkMapDomain(mode: NetworkMapColorMode, values: (number | null)[]): [number, number] {
  if (mode === "closeness") return [1, 3];
  const present = values.filter((value): value is number => value !== null);
  const minimum = mode === "people" ? 1 : 0;
  const maximum = Math.max(minimum + 1, ...present);
  return [minimum, maximum];
}

export type NetworkMapConnection = { code: string; people: number; introductions: number };

/**
 * Municipalities linked to `code`: where people counted here also live or work, and where the
 * targets of their active leads are (or whose leads point here). Sorted by strength, then code.
 */
export function networkMapConnections(code: string, data: NetworkMapData): NetworkMapConnection[] {
  const organizationCodes = organizationCodeMap(data.organizations);
  const locations = new Map(data.people.map((person) => [person.id, personLocations(person, organizationCodes)]));
  const connections = new Map<string, NetworkMapConnection>();
  const add = (other: string, key: "people" | "introductions") => {
    if (other === code) return;
    const connection = connections.get(other) ?? connections.set(other, { code: other, people: 0, introductions: 0 }).get(other)!;
    connection[key] += 1;
  };
  for (const places of locations.values()) {
    if (places.includes(code)) for (const other of places) add(other, "people");
  }
  for (const introduction of data.introductions) {
    const from = locations.get(introduction.contactId) ?? [];
    const targets = [...new Set(introduction.targetCodes)];
    if (from.includes(code)) for (const other of targets) add(other, "introductions");
    if (targets.includes(code)) for (const other of from) add(other, "introductions");
  }
  return [...connections.values()].sort(
    (a, b) => b.people + b.introductions - (a.people + a.introductions) || (a.code < b.code ? -1 : 1),
  );
}

export type NetworkMapParams = {
  /** The list filter without a residence municipality: on the map, that is the selection. */
  filter: ContactListFilter;
  color: NetworkMapColorMode;
  /** The selected municipality, if any. */
  municipalityCode: string;
};

const colorParam = z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.enum(networkMapColorModes)).catch("people");

/** URL search params → map state. Never throws. */
export function parseNetworkMapParams(raw: Record<string, string | string[] | undefined> | null | undefined): NetworkMapParams {
  const filter = parseContactListParams(raw);
  return {
    filter: { ...filter, municipalityCode: "", sort: "name" },
    color: colorParam.parse(raw?.color),
    municipalityCode: filter.municipalityCode,
  };
}

export const NETWORK_MAP_PATH = "/network/map";

/** Link to the map with `patch` applied; defaults are left out of the URL. */
export function networkMapHref(current: NetworkMapParams, patch: Partial<NetworkMapParams> = {}) {
  const next = { ...current, ...patch };
  const href = networkFilterHref(next.filter, { municipalityCode: next.municipalityCode, sort: "name" }, NETWORK_MAP_PATH);
  return next.color === "people" ? href : `${href}${href.includes("?") ? "&" : "?"}color=${next.color}`;
}
