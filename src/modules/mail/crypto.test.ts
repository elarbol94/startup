import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

beforeAll(() => { process.env.BETTER_AUTH_SECRET = "test-secret-with-enough-length-0123456789"; });

describe("mail password encryption", () => {
  it("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("pässwörd 123");
    expect(stored).not.toContain("pässwörd");
    expect(decryptSecret(stored)).toBe("pässwörd 123");
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, tag, data] = encryptSecret("secret").split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptSecret([version, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });
});
