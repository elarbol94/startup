import { describe, expect, it } from "vitest";
import { hasRemoteContent, sanitizeMailHtml } from "./sanitize";

describe("sanitizeMailHtml", () => {
  it("removes scripts, handlers, forms and frames", () => {
    const clean = sanitizeMailHtml(`<p onclick="x()">Hi<script>alert(1)</script></p><form><input name=a></form><iframe src="https://x"></iframe><a href="javascript:alert(1)">x</a>`);
    expect(clean).not.toMatch(/script|onclick|<form|<input|<iframe|javascript:/i);
    expect(clean).toContain("Hi");
  });

  it("opens links in a new tab without referrer", () => {
    expect(sanitizeMailHtml(`<a href="https://example.com">x</a>`)).toBe(`<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>`);
  });

  it("keeps newsletter layout", () => {
    const clean = sanitizeMailHtml(`<style>.a{color:red}</style><table width="600" bgcolor="#fff"><tr><td style="padding:4px">x</td></tr></table>`);
    expect(clean).toContain("<style>");
    expect(clean).toContain('bgcolor="#fff"');
    expect(clean).toContain('style="padding:4px"');
  });
});

describe("hasRemoteContent", () => {
  it("detects remote images and styles", () => {
    expect(hasRemoteContent(`<img src="https://t.example/p.gif">`)).toBe(true);
    expect(hasRemoteContent(`<div style="background:url('http://x/y.png')">`)).toBe(true);
    expect(hasRemoteContent(`<img src="data:image/png;base64,AAA">`)).toBe(false);
  });
});
