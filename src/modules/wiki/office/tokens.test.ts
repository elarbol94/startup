import { beforeAll, describe, expect, it } from "vitest";
import { signFileToken, signJwt, TokenError, verifyFileToken, verifyJwt } from "./tokens";
import { internalCacheUrl, OfficeHttpError } from "./office-http";
import type { OfficeConfig } from "./config";

beforeAll(() => { process.env.BETTER_AUTH_SECRET = "test-secret-with-enough-length-0123456789"; });

const secret = "a".repeat(40);

describe("JWT", () => {
  it("verifies signature, algorithm and expiry", () => {
    const token = signJwt({ payload: { key: "k" } }, secret);
    expect(verifyJwt(token, secret)).toMatchObject({ payload: { key: "k" } });
    expect(() => verifyJwt(token, "b".repeat(40))).toThrow(TokenError);
    expect(() => verifyJwt(signJwt({ exp: Math.floor(Date.now() / 1000) - 10 }, secret), secret)).toThrow(/expired/);
    const [, body, signature] = token.split(".");
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${body}.${signature}`;
    expect(() => verifyJwt(none, secret)).toThrow(TokenError);
    expect(() => verifyJwt("garbage", secret)).toThrow(TokenError);
  });

  it("binds file tokens to one resource and never accepts shared-secret tokens", () => {
    const token = signFileToken({ res: "docx", pageId: "p1", versionId: "v1", attachmentId: "a1" });
    expect(verifyFileToken(token)).toMatchObject({ res: "docx", pageId: "p1", versionId: "v1", attachmentId: "a1" });
    const forged = signJwt({ typ: "file", res: "docx", pageId: "p1", versionId: "v1", attachmentId: "a1", exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    expect(() => verifyFileToken(forged)).toThrow();
    expect(() => verifyFileToken(signFileToken({ res: "docx", pageId: "p1", versionId: "v1", attachmentId: "a1" }, -10))).toThrow(/expired/);
  });
});

describe("internalCacheUrl", () => {
  const config: OfficeConfig = { publicPath: "/office", internalUrl: "http://onlyoffice", appInternalUrl: "http://app:3000", inboxSecret: secret, outboxSecret: secret };

  it("fetches reported cache files through the internal URL only", () => {
    expect(internalCacheUrl("https://public.example/office/cache/files/data/k_1/output.docx/output.docx?md5=x&expires=1", config))
      .toBe("http://onlyoffice/cache/files/data/k_1/output.docx/output.docx?md5=x&expires=1");
    expect(internalCacheUrl("http://onlyoffice/cache/files/data/conv/output.pdf/x.pdf", config)).toBe("http://onlyoffice/cache/files/data/conv/output.pdf/x.pdf");
    // The reported host is never contacted, whatever it is.
    expect(internalCacheUrl("http://169.254.169.254/office/cache/files/x", config)).toBe("http://onlyoffice/cache/files/x");
  });

  it("rejects anything outside the document server's cache", () => {
    for (const url of ["http://onlyoffice/coauthoring/CommandService.ashx", "https://public.example/office/../api/files/1", "file:///etc/passwd", "not a url", "http://x/office/cache/files/../../secret"]) {
      expect(() => internalCacheUrl(url, config)).toThrow(OfficeHttpError);
    }
  });
});
