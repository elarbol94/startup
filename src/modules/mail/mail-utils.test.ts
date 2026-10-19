import { describe, expect, it } from "vitest";
import { formatAddress, parseAddressList, quoteText, replyRecipients, replySubject, senderInitials, threadHeaders } from "./mail-utils";

const me = "felix@example.com";

describe("replySubject", () => {
  it("adds a single Re: and keeps German prefixes", () => {
    expect(replySubject("Angebot", "reply")).toBe("Re: Angebot");
    expect(replySubject("Re: Angebot", "reply")).toBe("Re: Angebot");
    expect(replySubject("AW: Angebot", "replyAll")).toBe("AW: Angebot");
  });

  it("replaces forward prefixes with one Fwd:", () => {
    expect(replySubject("WG: Fwd: Angebot", "forward")).toBe("Fwd: Angebot");
  });
});

describe("parseAddressList", () => {
  it("parses names, quotes and separators", () => {
    const result = parseAddressList('a@b.at; "Doe, Jane" <jane@x.com>, Bob <bob@y.de>');
    expect(result.invalid).toEqual([]);
    expect(result.addresses).toEqual([
      { name: "", address: "a@b.at" },
      { name: "Doe, Jane", address: "jane@x.com" },
      { name: "Bob", address: "bob@y.de" },
    ]);
  });

  it("reports invalid entries", () => {
    expect(parseAddressList("nope, ok@x.at").invalid).toEqual(["nope"]);
  });

  it("round-trips formatted addresses", () => {
    const formatted = formatAddress({ name: "Doe, Jane", address: "jane@x.com" });
    expect(parseAddressList(formatted).addresses).toEqual([{ name: "Doe, Jane", address: "jane@x.com" }]);
  });
});

describe("replyRecipients", () => {
  const message = {
    from: [{ name: "Anna", address: "anna@x.at" }],
    to: [{ name: "", address: me }, { name: "", address: "bob@x.at" }],
    cc: [{ name: "", address: "carl@x.at" }, { name: "", address: "ANNA@x.at" }],
    replyTo: [],
  };

  it("replies to the sender", () => {
    expect(replyRecipients(message, "reply", me)).toEqual({ to: [{ name: "Anna", address: "anna@x.at" }], cc: [] });
  });

  it("reply all keeps everyone but the user, without duplicates", () => {
    const { to, cc } = replyRecipients(message, "replyAll", me);
    expect(to.map((entry) => entry.address)).toEqual(["anna@x.at"]);
    expect(cc.map((entry) => entry.address)).toEqual(["bob@x.at", "carl@x.at"]);
  });

  it("prefers Reply-To", () => {
    const result = replyRecipients({ ...message, replyTo: [{ name: "", address: "list@x.at" }] }, "reply", me);
    expect(result.to.map((entry) => entry.address)).toEqual(["list@x.at"]);
  });

  it("replying to one's own sent mail goes to its recipients", () => {
    const sent = { from: [{ name: "", address: me }], to: [{ name: "", address: "bob@x.at" }], cc: [], replyTo: [] };
    expect(replyRecipients(sent, "reply", me).to.map((entry) => entry.address)).toEqual(["bob@x.at"]);
  });
});

describe("threading and quoting", () => {
  it("builds In-Reply-To and References", () => {
    expect(threadHeaders({ messageId: "<b@x>", references: ["<a@x>"] })).toEqual({ inReplyTo: "<b@x>", references: ["<a@x>", "<b@x>"] });
    expect(threadHeaders({ messageId: "", references: [] })).toEqual({});
  });

  it("quotes every line", () => {
    expect(quoteText("Hallo\n> alt\n\n")).toBe("> Hallo\n>> alt");
  });

  it("derives initials", () => {
    expect(senderInitials({ name: "Anna Berger", address: "a@x.at" })).toBe("AB");
    expect(senderInitials({ name: "", address: "felix.wicha@x.at" })).toBe("FW");
  });
});
