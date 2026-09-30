import { getUserMarkColor } from "@/lib/user-mark-colors";

export type OfficeIdentity = { id: string; name?: string; markColor: string };
export type OfficeColorResolver = (userId?: string | null, userName?: string | null) => number | null;

/** The part of the editor's `AscCommon` we use (internal API of the pinned 9.4 image). */
type AscCommonColors = {
  getUserColorById?: (userId: unknown, userName: unknown, isDark: unknown, isNumeric: unknown) => unknown;
  setUserColorById?: (userId: string, color: number) => void;
};
type ColorHolder = { resolve: OfficeColorResolver; seeded: Set<string> };
type PatchedGetter = NonNullable<AscCommonColors["getUserColorById"]> & { workspaceColors?: ColorHolder };

function hexToNumber(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

/**
 * Maps editor user keys to the app's personal colours. The editor keys a
 * co-editing connection as `user.id + connection index` (e.g. "<id>3"),
 * comments by the plain id, and track changes sometimes only by author name.
 */
export function buildOfficeColorResolver(identities: OfficeIdentity[]): OfficeColorResolver {
  const byId = new Map(identities.map((person) => [person.id, hexToNumber(getUserMarkColor(person.markColor).solid)]));
  const idsByLength = [...byId.keys()].sort((a, b) => b.length - a.length);
  const byName = new Map<string, number | null>();
  for (const person of identities) {
    if (!person.name) continue;
    byName.set(person.name, byName.has(person.name) ? null : byId.get(person.id)!);
  }
  return (userId, userName) => {
    if (userId) {
      const exact = byId.get(userId);
      if (exact !== undefined) return exact;
      const owner = idsByLength.find((id) => userId.startsWith(id) && /^\d+$/.test(userId.slice(id.length)));
      if (owner) return byId.get(owner)!;
    }
    return userName ? byName.get(userName) ?? null : null;
  };
}

/**
 * Makes the editor use the app's user colours. The editor frame is
 * same-origin; its colour cache is seeded with every known user and the
 * lookup is wrapped once so connection ids resolve too. Does nothing when the
 * editor's internals are not (yet) there: colours then stay ONLYOFFICE's own.
 */
export function applyOfficeUserColors(frame: HTMLIFrameElement | null | undefined, identities: OfficeIdentity[]) {
  let asc: AscCommonColors | undefined;
  try {
    asc = (frame?.contentWindow as (Window & { AscCommon?: AscCommonColors }) | null | undefined)?.AscCommon;
  } catch {
    return false;
  }
  const set = asc?.setUserColorById;
  const get = asc?.getUserColorById as PatchedGetter | undefined;
  if (!asc || typeof set !== "function" || typeof get !== "function") return false;

  const resolve = buildOfficeColorResolver(identities);
  for (const person of identities) {
    const color = resolve(person.id);
    if (color === null) continue;
    set(person.id, color);
    if (person.name && resolve(null, person.name) === color) set(person.name, color);
  }

  if (get.workspaceColors) {
    // Re-resolve connection ids too: a user may have changed their colour.
    get.workspaceColors.resolve = resolve;
    get.workspaceColors.seeded.clear();
    return true;
  }
  const holder: ColorHolder = { resolve, seeded: new Set() };
  const wrapped: PatchedGetter = (userId, userName, isDark, isNumeric) => {
    const key = typeof userId === "string" && userId ? userId : typeof userName === "string" ? userName : "";
    if (key && !holder.seeded.has(key)) {
      const color = holder.resolve(typeof userId === "string" ? userId : null, typeof userName === "string" ? userName : null);
      if (color !== null) {
        holder.seeded.add(key);
        set(key, color);
      }
    }
    return get(userId, userName, isDark, isNumeric);
  };
  wrapped.workspaceColors = holder;
  asc.getUserColorById = wrapped;
  return true;
}
