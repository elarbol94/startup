// Pure filter/sort helpers for the "My network" list, shared by the page, the
// query and the client filter bar (no DB imports).
import { z } from "zod";
import {
  contactClosenessLevels,
  contactRelationships,
  type ContactCloseness,
  type ContactRelationship,
} from "./constants";
import { normalizeText } from "./network-utils";
import { compareReconnectDue } from "./reconnect-utils";

export const contactSorts = ["name", "lastContact", "recent", "reconnect"] as const;
export type ContactSort = (typeof contactSorts)[number];

/** `mine`: contacts the viewer owns; `team`: shared ones. Scope only ever narrows what is visible. */
export const contactScopes = ["all", "mine", "team"] as const;
export type ContactScope = (typeof contactScopes)[number];

export type ContactListFilter = {
  query: string;
  tagId: string;
  relationship: ContactRelationship | "";
  closeness: ContactCloseness | "";
  scope: ContactScope;
  organizationId: string;
  municipalityCode: string;
  sort: ContactSort;
};

export const defaultContactListFilter: ContactListFilter = {
  query: "",
  tagId: "",
  relationship: "",
  closeness: "",
  scope: "all",
  organizationId: "",
  municipalityCode: "",
  sort: "name",
};

/** A filter option with how many visible contacts have it (tag, organisation, municipality code). */
export type NetworkFacet = { id: string; name: string; count: number };

const MAX_QUERY_LENGTH = 200;
const MAX_ID_LENGTH = 100;

/** Repeated search params (`?tag=a&tag=b`) use the first value; invalid values become `undefined`. */
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const param = <T extends z.ZodType>(schema: T) => z.preprocess(first, schema.optional()).catch(undefined);

const idParam = param(z.string().trim().min(1).max(MAX_ID_LENGTH));

const paramsSchema = z.object({
  q: param(z.string().transform((value) => value.trim().slice(0, MAX_QUERY_LENGTH))),
  tag: idParam,
  relationship: param(z.enum(contactRelationships)),
  closeness: param(z.enum(contactClosenessLevels)),
  scope: param(z.enum(contactScopes)),
  organization: idParam,
  municipality: param(z.string().regex(/^\d{5}$/)),
  sort: param(z.enum(contactSorts)),
});

type RawParams = Record<string, string | string[] | undefined>;

/** URL search params → filter. Never throws: anything unknown falls back to "no filter" or the default sort. */
export function parseContactListParams(raw: RawParams | null | undefined): ContactListFilter {
  const params = paramsSchema.parse(raw ?? {});
  const d = defaultContactListFilter;
  return {
    query: params.q ?? d.query,
    tagId: params.tag ?? d.tagId,
    relationship: params.relationship ?? d.relationship,
    closeness: params.closeness ?? d.closeness,
    scope: params.scope ?? d.scope,
    organizationId: params.organization ?? d.organizationId,
    municipalityCode: params.municipality ?? d.municipalityCode,
    sort: params.sort ?? d.sort,
  };
}

/** Whether anything narrows the list; the sort order alone does not. */
export function isContactListFiltered(filter: ContactListFilter) {
  return (Object.keys(defaultContactListFilter) as (keyof ContactListFilter)[])
    .some((key) => key !== "sort" && filter[key] !== defaultContactListFilter[key]);
}

/** Filter field → URL param, in the order they appear in links. */
const paramNames: [keyof ContactListFilter, string][] = [
  ["query", "q"],
  ["tagId", "tag"],
  ["relationship", "relationship"],
  ["closeness", "closeness"],
  ["scope", "scope"],
  ["organizationId", "organization"],
  ["municipalityCode", "municipality"],
  ["sort", "sort"],
];

/**
 * Link to the list with `patch` applied to the current filter. Every other
 * value is kept; defaults and empty values are left out of the URL.
 */
export function networkFilterHref(current: ContactListFilter, patch: Partial<ContactListFilter> = {}) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [key, name] of paramNames) {
    const value = next[key];
    if (value && value !== defaultContactListFilter[key]) params.set(name, value);
  }
  const search = params.toString();
  return search ? `/network?${search}` : "/network";
}

export type SortableContact = {
  id: string;
  name: string;
  lastContactOn: string | null;
  reconnectEveryDays: number | null;
  createdAt: Date;
};
type Comparator = (a: SortableContact, b: SortableContact) => number;

function byName(a: SortableContact, b: SortableContact) {
  return normalizeText(a.name).localeCompare(normalizeText(b.name), "de") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Dates as YYYY-MM-DD compare as strings; contacts without one go last. */
function byLastContact(a: SortableContact, b: SortableContact) {
  if (a.lastContactOn === b.lastContactOn) return 0;
  if (a.lastContactOn === null) return 1;
  if (b.lastContactOn === null) return -1;
  return a.lastContactOn < b.lastContactOn ? 1 : -1;
}

const comparators: Record<ContactSort, Comparator> = {
  name: () => 0,
  lastContact: byLastContact,
  recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  // Never contacted (with a cadence) first, then due date; without a cadence last.
  reconnect: compareReconnectDue,
};

/** Comparator for a sort; ties are broken by normalised name, then id, so the order is stable. */
export function compareContacts(sort: ContactSort): Comparator {
  const primary = comparators[sort];
  return (a, b) => primary(a, b) || byName(a, b);
}
