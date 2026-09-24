import { describe, expect, it } from "vitest";
import { documentName, parseDocumentName } from "./socket-protocol";

describe("socket document names", () => {
  it("round-trips wiki page ids", () => {
    expect(parseDocumentName(documentName("page", "0b7c9f2e-1d2a-4f8e-9a51-2c1f3e4d5a6b"))).toEqual({ kind: "page", id: "0b7c9f2e-1d2a-4f8e-9a51-2c1f3e4d5a6b" });
    expect(parseDocumentName("page:tz4a98xxat96iws9zmbrgj3a")).toEqual({ kind: "page", id: "tz4a98xxat96iws9zmbrgj3a" });
  });

  it("rejects presentations, unknown kinds and malformed names", () => {
    expect(parseDocumentName("presentation:abc")).toBeNull();
    expect(parseDocumentName("user:abc")).toBeNull();
    expect(parseDocumentName("page:")).toBeNull();
    expect(parseDocumentName("page:../../etc")).toBeNull();
    expect(parseDocumentName(`page:${"a".repeat(201)}`)).toBeNull();
  });
});
