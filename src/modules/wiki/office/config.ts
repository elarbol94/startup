/**
 * Runtime configuration for the embedded ONLYOFFICE Docs server.
 * See docs/office-documents.md for the deployment topology.
 */
export type OfficeConfig = {
  /** Browser-facing path of the document server on the app origin (e.g. "/office"). */
  publicPath: string;
  /** Document-server base URL on the internal network (e.g. "http://onlyoffice"). */
  internalUrl: string;
  /** App base URL as reached from the document server (e.g. "http://app:3000"). */
  appInternalUrl: string;
  /** Signs editor configs and CommandService/ConvertService requests. */
  inboxSecret: string;
  /** Verifies callbacks sent by the document server. */
  outboxSecret: string;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export function officeConfig(): OfficeConfig | null {
  if (process.env.OFFICE_DISABLED === "true") return null;
  const inboxSecret = process.env.ONLYOFFICE_INBOX_SECRET ?? "";
  const outboxSecret = process.env.ONLYOFFICE_OUTBOX_SECRET ?? inboxSecret;
  const internalUrl = process.env.ONLYOFFICE_INTERNAL_URL ?? "";
  const appInternalUrl = process.env.APP_INTERNAL_URL ?? "";
  if (inboxSecret.length < 32 || outboxSecret.length < 32 || !internalUrl || !appInternalUrl) return null;
  const publicPath = "/" + (process.env.ONLYOFFICE_PUBLIC_PATH ?? "/office").replace(/^\/+|\/+$/g, "");
  return { publicPath, internalUrl: trimSlash(internalUrl), appInternalUrl: trimSlash(appInternalUrl), inboxSecret, outboxSecret };
}

export function requireOfficeConfig(): OfficeConfig {
  const config = officeConfig();
  if (!config) throw new OfficeUnavailableError();
  return config;
}

export class OfficeUnavailableError extends Error {
  constructor() { super("officeUnavailable"); }
}
