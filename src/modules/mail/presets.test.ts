import { describe, expect, it } from "vitest";
import { guessMailServer, HETZNER_WEBHOSTING, providerStoresSentMail } from "./presets";

describe("guessMailServer", () => {
  it("defaults to Hetzner Webhosting for the company's own domains", () => {
    expect(guessMailServer("felix@elarbol.me")).toEqual(HETZNER_WEBHOSTING);
    expect(guessMailServer("")).toEqual(HETZNER_WEBHOSTING);
  });

  it("recognises public providers", () => {
    expect(guessMailServer("someone@GMAIL.com").imapHost).toBe("imap.gmail.com");
    expect(guessMailServer("someone@gmx.at").smtpHost).toBe("mail.gmx.net");
  });

  it("knows which providers file sent mail themselves", () => {
    expect(providerStoresSentMail("smtp.gmail.com")).toBe(true);
    expect(providerStoresSentMail("mail.your-server.de")).toBe(false);
  });
});
