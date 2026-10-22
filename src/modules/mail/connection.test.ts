import { beforeEach, expect, it, vi } from "vitest";

const { dnsLookup, ImapFlow } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  ImapFlow: vi.fn(function () { return { on: vi.fn(), connect: vi.fn(async () => undefined), logout: vi.fn(async () => undefined), close: vi.fn() }; }),
}));
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ default: { lookup: dnsLookup } }));
vi.mock("imapflow", () => ({ ImapFlow }));

import { resolveMailHost } from "./connection";
import { verifyImapLogin } from "./imap";

const credentials = { emailAddress: "a@example.com", displayName: "A", imapHost: "mail.example.com", imapPort: 993, imapSecure: true, smtpHost: "mail.example.com", smtpPort: 465, smtpSecurity: "tls" as const, username: "a", password: "p" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MAIL_ALLOW_PRIVATE_HOSTS;
  dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

it("connects to the checked address and keeps the typed name for TLS", async () => {
  await verifyImapLogin(credentials);
  expect(ImapFlow).toHaveBeenCalledWith(expect.objectContaining({ host: "93.184.216.34", tls: { servername: "mail.example.com" } }));
});

it("refuses private answers unless MAIL_ALLOW_PRIVATE_HOSTS is set", async () => {
  dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]);
  await expect(resolveMailHost("mail.example.com")).rejects.toMatchObject({ code: "connection_failed" });
  process.env.MAIL_ALLOW_PRIVATE_HOSTS = "true";
  await expect(resolveMailHost("mail.example.com")).resolves.toEqual({ host: "mail.example.com" });
});
